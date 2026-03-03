# Weapon Mastery – D&D 2024 Automation for Foundry VTT

A highly targeted Foundry VTT module that automates D&D 2024 **Weapon Mastery** properties.  
It listens for attack-roll hooks, reads the weapon's mastery property, and automatically applies a temporary status-icon ActiveEffect to every hit target that expires after one round.

---

## Features

| Mastery | Behaviour |
|---------|-----------|
| **Sap** | Applies *Sapped* (disadvantage on next attack roll) to each hit target for 1 round |
| **Vex** | Applies *Vexed* (attacker has advantage on next attack vs. this target) for 1 round |
| **Slow** | Applies *Slowed* (speed –10 ft) to each hit target for 1 round |
| **Topple** | Applies *Topple Check* reminder icon; prompts the GM to call for the Constitution save |
| **Push** | Applies *Pushed* reminder icon; prompts the GM to move the target 10 ft |
| **Cleave** | Posts a chat reminder describing the extra attack rules |
| **Graze** | Posts a chat reminder describing the minimum-damage rules |
| **Nick** | Posts a chat reminder describing the Light-weapon extra-attack rules |

### How it works

1. A player or GM makes an attack roll with a weapon that has a mastery property set in its item sheet (`item.system.mastery`).
2. The module compares the roll total against the targeted token's AC (natural 20 = always hit; natural 1 = always miss; unknown AC = treat as hit so the GM can remove the effect if needed).
3. For status-applicable masteries the module creates a 1-round `ActiveEffect` on each hit target — complete with icon, name, and description — and posts a notification to the chat log.
4. For reminder-only masteries (Cleave, Graze, Nick) it posts a chat description of the rule so the GM / player can action it manually.

---

## Requirements

| Dependency | Version |
|------------|---------|
| Foundry VTT | v11 or v12 (verified) |
| dnd5e system | v3.x or later (supports `item.system.mastery`) |

---

## Installation

### Manual installation

1. Download or clone this repository.
2. Copy the module folder into `<foundry-data>/Data/modules/weapon-mastery/`.
3. Restart Foundry VTT and enable the module in **Game Settings → Manage Modules**.

### Module manifest URL

```
https://raw.githubusercontent.com/tescolopio/FoundryVTT_WeaponMaster/main/module.json
```

Paste that URL into **Install Module → Manifest URL** inside Foundry VTT.

---

## Usage

1. Open the weapon item sheet for a 2024-rules weapon.
2. Set the **Mastery** property (e.g. *Sap*) on the weapon's Details tab.
3. Target one or more tokens before rolling an attack.
4. Roll the attack — the module will automatically apply the correct status effect to any targets that were hit.

> **Tip:** If you forget to target before rolling, you can apply the effect manually or re-roll the attack with targets set.

---

## Permissions

Players who do not own the target actor (e.g. attacking an enemy NPC) cannot create ActiveEffects directly.  
The module automatically forwards the request to the **active GM client** via Foundry's socket API, so the effect is applied without any GM interaction required.

---

## Project structure

```
weapon-mastery/
├── module.json                  Foundry VTT manifest
├── scripts/
│   └── weapon-mastery.js        Core module logic
├── styles/
│   └── weapon-mastery.css       Chat notification styles
├── lang/
│   └── en.json                  English localisation strings
└── README.md
```

---

## License

MIT — see [LICENSE](LICENSE).
