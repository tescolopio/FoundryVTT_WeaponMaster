/**
 * Weapon Mastery – D&D 2024 Weapon Mastery Automation
 * Foundry VTT Module
 *
 * Listens for dnd5e attack-roll hooks, reads the weapon's mastery property, and
 * automatically creates a 1-round ActiveEffect status icon on every hit target.
 * Non-auto-applicable masteries (Cleave, Graze, Nick) post a reminder to chat.
 *
 * Permission handling: when the rolling user does not own a target actor the
 * effect request is forwarded via socket to the active GM.
 */

const MODULE_ID = "weapon-mastery";
const SOCKET_NAME = `module.${MODULE_ID}`;

// ---------------------------------------------------------------------------
// Mastery configuration
// ---------------------------------------------------------------------------

/**
 * Masteries that are auto-applied as status ActiveEffects to hit targets.
 * Keys must match the value stored in `item.system.mastery` by the dnd5e system.
 *
 * Icons use paths that ship with Foundry VTT core (v11/v12) or the dnd5e system.
 */
const MASTERY_EFFECT_DATA = {
  sap: {
    name: "Sapped",
    icon: "icons/svg/stoned.svg",
    description: "Disadvantage on the next attack roll (Weapon Mastery: Sap).",
    statusId: "weapon-mastery-sap",
  },
  vex: {
    name: "Vexed",
    icon: "icons/svg/eye.svg",
    description:
      "The attacker has advantage on the next attack roll against this target (Weapon Mastery: Vex).",
    statusId: "weapon-mastery-vex",
  },
  slow: {
    name: "Slowed (Mastery)",
    icon: "icons/svg/snowflake.svg",
    description:
      "Speed is reduced by 10 feet until the start of the attacker's next turn (Weapon Mastery: Slow).",
    statusId: "weapon-mastery-slow",
  },
  topple: {
    name: "Topple Check",
    icon: "icons/svg/falling.svg",
    description:
      "Must succeed on a Constitution saving throw (DC = 8 + proficiency bonus + Str/Dex modifier) or fall Prone (Weapon Mastery: Topple).",
    statusId: "weapon-mastery-topple",
  },
  push: {
    name: "Pushed (Mastery)",
    icon: "icons/svg/target.svg",
    description:
      "Pushed 10 feet away in a direction of the attacker's choice (Weapon Mastery: Push).",
    statusId: "weapon-mastery-push",
  },
};

/**
 * Masteries that cannot be reduced to a simple status icon because they require
 * a choice, a saving throw prompt, or additional dice rolls. These only post a
 * chat reminder so the GM / player can handle them manually.
 */
const REMINDER_MASTERIES = {
  cleave:
    "Cleave: You may make one additional attack against a different creature within 5 feet, using the same action. The extra attack deals no ability-modifier damage.",
  graze:
    "Graze: Even on a miss, the target takes damage equal to your Strength or Dexterity modifier (your choice, minimum 0).",
  nick: "Nick: The extra attack from the Light weapon property is now part of the Attack action rather than the Bonus Action.",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the data object used to create an ActiveEffect on a target actor.
 * @param {string} mastery - Mastery identifier (e.g. "sap")
 * @param {object} config  - Entry from MASTERY_EFFECT_DATA
 * @param {number|null} currentRound - Current combat round (null if not in combat)
 * @returns {object}
 */
function buildMasteryEffect(mastery, config, currentRound) {
  return {
    name: config.name,
    icon: config.icon,
    description: config.description,
    statuses: [config.statusId],
    duration: {
      rounds: 1,
      startRound: currentRound ?? null,
      startTime: game.time.worldTime,
    },
    flags: {
      [MODULE_ID]: { mastery, autoApplied: true },
    },
  };
}

/**
 * Determines whether an attack roll hit a given target.
 * Falls back to true (assume hit) when the target's AC cannot be read, so the
 * GM can simply remove the effect if the attack actually missed.
 *
 * @param {D20Roll} roll   - The completed attack roll
 * @param {Token}   target - The targeted token document
 * @returns {boolean}
 */
function attackHit(roll, target) {
  const d20Die = roll.dice?.[0];
  const d20Result = d20Die?.results?.[0]?.result;

  if (d20Result === 20) return true; // critical hit – always a hit
  if (d20Result === 1) return false; // critical miss – always a miss

  const targetAC = target.actor?.system?.attributes?.ac?.value;
  if (targetAC == null) return true; // == null intentionally catches both null and undefined; assume hit
  return roll.total >= targetAC;
}

/**
 * Posts a weapon mastery notification to the chat log.
 *
 * @param {Item5e}  item        - The weapon item
 * @param {string}  mastery     - Mastery identifier
 * @param {Token[]} targets     - Tokens that were affected (or prompted)
 * @param {string}  [reminder]  - Reminder text for non-auto masteries
 */
function postMasteryMessage(item, mastery, targets, reminder) {
  const masteryLabel =
    game.i18n.localize(`WEAPON_MASTERY.Mastery.${mastery}`) ||
    mastery.charAt(0).toUpperCase() + mastery.slice(1);

  const effectConfig = MASTERY_EFFECT_DATA[mastery];
  const targetNames = targets.map((t) => t.name).join(", ");
  const attackerName = item.actor?.name ?? game.user.name;

  let content;
  if (effectConfig) {
    content = `
      <div class="weapon-mastery-notification">
        <p>
          <strong>${attackerName}</strong> hit with
          <em>${item.name}</em> using <strong>${masteryLabel}</strong> mastery.
        </p>
        <p>
          Applied <strong>${effectConfig.name}</strong> to:
          <em>${targetNames}</em>.
        </p>
        <p class="weapon-mastery-hint"><em>${effectConfig.description}</em></p>
      </div>`;
  } else {
    content = `
      <div class="weapon-mastery-notification weapon-mastery-reminder">
        <p>
          <strong>${attackerName}</strong> used
          <em>${item.name}</em> with <strong>${masteryLabel}</strong> mastery.
        </p>
        <p class="weapon-mastery-hint"><em>${reminder}</em></p>
      </div>`;
  }

  ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: item.actor }),
  });
}

// ---------------------------------------------------------------------------
// Effect application (with socket fallback for unowned actors)
// ---------------------------------------------------------------------------

/**
 * Applies a mastery ActiveEffect to a single token's actor.
 * If the current user owns the actor the effect is applied directly; otherwise
 * the request is forwarded to the active GM via socket.
 *
 * @param {Token}  token      - The target token
 * @param {object} effectData - ActiveEffect creation data
 */
async function applyEffectToTarget(token, effectData) {
  if (!token.actor) return;

  if (token.actor.isOwner) {
    await token.actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
  } else {
    game.socket.emit(SOCKET_NAME, {
      type: "applyMasteryEffect",
      sceneId: token.scene?.id ?? canvas.scene?.id,
      tokenId: token.id,
      effectData,
    });
  }
}

// ---------------------------------------------------------------------------
// Core mastery handler
// ---------------------------------------------------------------------------

/**
 * Main handler called by attack-roll hooks.
 *
 * @param {Item5e} item - The weapon used for the attack
 * @param {D20Roll} roll - The completed attack roll
 */
async function onRollAttack(item, roll) {
  const mastery = item?.system?.mastery;
  if (!mastery) return;

  const selectedTargets = [...game.user.targets];
  if (!selectedTargets.length) return;

  // Only affect targets that were actually hit
  const hitTargets = selectedTargets.filter((token) => attackHit(roll, token));
  if (!hitTargets.length) return;

  const effectConfig = MASTERY_EFFECT_DATA[mastery];
  const reminderText = REMINDER_MASTERIES[mastery];

  // Silently ignore unknown / unhandled mastery strings
  if (!effectConfig && !reminderText) return;

  if (effectConfig) {
    const currentRound = game.combat?.round ?? null;
    const effectData = buildMasteryEffect(mastery, effectConfig, currentRound);
    await Promise.all(
      hitTargets.map((token) => applyEffectToTarget(token, effectData))
    );
    postMasteryMessage(item, mastery, hitTargets);
  } else {
    // Reminder-only mastery (Cleave, Graze, Nick)
    postMasteryMessage(item, mastery, hitTargets, reminderText);
  }
}

// ---------------------------------------------------------------------------
// Hook registration
// ---------------------------------------------------------------------------

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Weapon Mastery module initializing.`);
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | Weapon Mastery module ready.`);

  // GM-side socket listener: apply effects requested by non-owning players.
  game.socket.on(SOCKET_NAME, async (data) => {
    if (data?.type !== "applyMasteryEffect") return;
    // Only the active GM processes these requests (prevents duplicate writes).
    if (!game.users.activeGM?.isSelf) return;

    const scene = game.scenes.get(data.sceneId);
    const tokenDoc = scene?.tokens?.get(data.tokenId);
    if (tokenDoc?.actor) {
      await tokenDoc.actor.createEmbeddedDocuments("ActiveEffect", [
        data.effectData,
      ]);
    }
  });
});

// dnd5e 3.x hook
Hooks.on("dnd5e.rollAttack", (item, roll, _ammoUpdate) => {
  onRollAttack(item, roll);
});

// dnd5e 3.3+ / 4.x hook (rolls is an array; data.subject holds the item)
Hooks.on("dnd5e.rollAttackV2", (rolls, data) => {
  const item = data?.subject ?? data?.item;
  const roll = rolls?.[0];
  if (item && roll) onRollAttack(item, roll);
});
