import { MEGS } from "../helpers/config.mjs";
import {MegsTableRolls, RollValues} from "../dice.mjs";

/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class MEGSItem extends Item {

  /** @override */
  constructor(data, context) {
    super(data, context);
  }

  /**
   * Augment the basic Item data model with additional dynamic data.
   */
  prepareData() {
    // As with the actor class, items are documents that can have their data
    // preparation methods overridden (such as prepareBaseData()).
    super.prepareData();
  }

  /**
   * @override
   * Augment the item source data with additional dynamic data. Typically,
   * you'll want to handle most of your calculated/derived data in this step.
   * Data calculated in this step should generally not exist in template.json
   * (such as attribute modifiers rather than attribute scores) and should be
   * available both inside and outside of actor sheets (such as if an actor
   * is queried and has a roll executed directly from it).
   */
  prepareDerivedData() {
    const itemData = this;
    const systemData = itemData.system;

    // replace default icon if another has been specified in template.json
    if (itemData.img === "icons/svg/item-bag.svg") {
      if (systemData.img !== "") {
        this.img = systemData.img;
      }
    }

    // calculate gadget bonus
    if (this.type === MEGS.itemTypes.gadget) {
      if (itemData.canBeTakenAway) {
        this.gadgetBonus = 4;
      } else {
        this.gadgetBonus = 2;
      }
    }

    // calculate total cost of the item
    // TODO gadgets are different
    if (systemData.hasOwnProperty("baseCost")) {
      if (systemData.hasOwnProperty("factorCost") && systemData.hasOwnProperty("aps")) {
        systemData.totalCost = systemData.baseCost + (systemData.factorCost * systemData.aps);
      } else {
        systemData.totalCost = systemData.baseCost;
      }
      this.totalCost = systemData.totalCost;
    }

    // import constants
    systemData.powerTypes = MEGS.powerTypes;
    systemData.powerSources = MEGS.powerSources;
    systemData.ranges = MEGS.ranges;
  }

  /**
   * Prepare a data object which defines the data schema used by dice roll commands against this Item
   * @override
   */
  getRollData() {
    // Starts off by populating the roll data with `this.system`
    const rollData = { ...super.getRollData() };

    // Quit early if there's no parent actor
    if (!this.actor) return rollData;

    // If present, add the actor's roll data
    rollData.actor = this.actor.getRollData();

    return rollData;
  }


  /**
   *
   * @param event
   */
  rollMegs() {
    console.error("TEST1");
    console.error(this); // TODO
    console.error(this.actor); // TODO

    // for powers, AV and EV are typically APs of power
    let actionValue = parseInt(this.system.aps);
    let effectValue = parseInt(this.system.aps);
    let opposingValue = 0;
    let resistanceValue = 0;

    let dataset = { };

    let targetActor = MegsTableRolls.getTargetActor();
    console.error("TEST2");
    console.error(targetActor); // TODO

    if (this.type === MEGS.itemTypes.power) {
      // TODO physical powers should have AV of DEX, mental INT, mystical INFL - optional rule

      // Physical powers - OV and RV are DEX and BODY
      if (this.system[this.system.link].type === MEGS.powerSources.physical.toLowerCase()) {
        dataset.key = MEGS.attributeAbbreviations.str;
      }
      // Mental powers - OV and RV are INT and MIND
      if (this.system[this.system.link].type === MEGS.powerSources.mental.toLowerCase()) {
        dataset.key = MEGS.attributeAbbreviations.int;
      }
      // Mystical powers - OV and RV are INFL and SPIRIT
      if (this.system[this.system.link].type === MEGS.powerSources.mystical.toLowerCase()) {
        dataset.key = MEGS.attributeAbbreviations.infl;
      }
      if (targetActor) {
        opposingValue = this._getOpposingValueForPower(dataset.key, targetActor);
        resistanceValue = this._getResistanceValueForPower(dataset.key, targetActor);
      }
    }

    // values of skills and subskills
    if (this.type === MEGS.itemTypes.skill || this.type === MEGS.itemTypes.subskill) {
    }

    let label = this.name;
    if (this.parent && this.parent.name) {
      label = this.parent.name + " - " + label;
    }

    console.error("TEST3: label = "+label+" | av = "+actionValue+" | ev = "+effectValue+" | ov = "+opposingValue+" | rv = "+resistanceValue);

    const rollValues = new RollValues(label, this.type, this.system.aps, actionValue, opposingValue,
        effectValue, resistanceValue, dataset.roll, dataset.unskilled);
    const rollTables = new MegsTableRolls(rollValues);
    rollTables.roll(null, this.parent.system.heroPoints.value).then((response) => {
    })
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  async roll() {
    const item = this;

    // Initialize chat data.
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    const rollMode = game.settings.get('core', 'rollMode');
    const label = `[${item.actor.name}] ${item.name}`;

    if (!this.system.formula && (this.type === MEGS.itemTypes.skill || this.type === MEGS.itemTypes.subskill || this.type === MEGS.itemTypes.power) ) {
      this.rollMegs();
    }

    // If there's no roll data, send a chat message.
    else if (!this.system.formula) {
      ChatMessage.create({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
        content: item.system.description ?? '',
      });
    }
    // Otherwise, create a roll and send a chat message from it.
    else {
      // Retrieve roll data.
      const rollData = this.getRollData();

      // Invoke the roll and submit it to chat.
      const roll = new Roll(rollData.formula, rollData);
      // If you need to store the value first, uncomment the next line.
      // const result = await roll.evaluate();
      roll.toMessage({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
      });
      return roll;
    }
  }

  /** @override */
  static async create(data, context={}) {
    const createData = data instanceof Array ? data : [data];
    const created = await this.createDocuments(createData, context);
    return data instanceof Array ? created : created.shift();
  }

  /** @override */
  getEmbeddedCollection(embeddedName) {
    const collectionName = this.constructor.getCollectionName(embeddedName);
    if ( !collectionName ) {
      throw new Error(`${embeddedName} is not a valid embedded Document within the ${this.documentName} Document`);
    }
    const field = this.constructor.hierarchy[collectionName];
    return field.getCollection(this);
  }

}
