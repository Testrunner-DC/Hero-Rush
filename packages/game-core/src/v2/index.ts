import { registerStarterEffectsV2 } from "./cards/starterEffects";
import { registerStarterEffectsSd03Sd04V2 } from "./cards/starterEffectsSd03Sd04";
import { registerPromoEffectsEb01V2 } from "./cards/promoEffectsEb01";
import { registerPromoEffectsPb01V2 } from "./cards/promoEffectsPb01";
import { registerPromoEffectsTb01V2 } from "./cards/promoEffectsTb01";
import { registerPromoEffectsSp01V2 } from "./cards/promoEffectsSp01";
import { registerPromoEffectsBp01V2 } from "./cards/promoEffectsBp01";

registerStarterEffectsV2();
registerStarterEffectsSd03Sd04V2();
registerPromoEffectsEb01V2();
registerPromoEffectsPb01V2();
registerPromoEffectsTb01V2();
registerPromoEffectsSp01V2();
registerPromoEffectsBp01V2();

export * from "./model";
export * from "./control";
export * from "./random";
export * from "./deckUtils";
export * from "./commandPolicy";
export * from "./invariants";
export * from "./stateHash";
export * from "./setup";
export * from "./kernel";
export * from "./projection";
export * from "./replay";
export * from "./effects/index";
export * from "./cards/index";
