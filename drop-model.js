/* Loot math follows the locally verified generator. All probabilities are conditional on inputs. */
(()=>{'use strict';
const D=window.ATLAS_DROPS;
const sources=new Map(D.sources.map(s=>[s.id,s])),areas=new Map(D.areas.map(a=>[a.id,a]));
const itemIds=new Map(Object.keys(D.items).map(id=>[id.toLowerCase(),id])),itemId=id=>itemIds.get(String(id).toLowerCase())||id;
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,Number(n)||0));
const cache=new Map();

function mergeOps(lists){
 const out=new Map();
 for(const list of lists)for(const e of list){
  const key=e.target+'|'+e.operation,old=out.get(key);
  if(!old)out.set(key,{...e});
  else if(e.operation==='Set')old.weight=Math.max(old.weight,e.weight);
  else if(e.operation==='Add')old.weight+=e.weight;
  else old.weight*=e.weight;
 }
 return [...out.values()];
}
function evaluateWeights(entries,factor=()=>1){
 const values=new Map();
 for(const e of entries){const v=values.get(e.target)||{};v[e.operation]=e.weight*factor(e.target);values.set(e.target,v);}
 return new Map([...values].map(([id,v])=>[id,Math.max(0,((v.Set??0)+(v.Add??0))*(v.Multiply??1))]));
}
function combineSlots(profiles){
 const slots=new Map();
 for(const profile of profiles)for(const s of profile?.slots||[]){if(!slots.has(s.id))slots.set(s.id,[]);slots.get(s.id).push(s);}
 return [...slots].map(([id,parts])=>{
  const positive=parts.map(p=>p.chance).filter(p=>p>0);
  return {id,guaranteed:Math.max(...parts.map(p=>p.guaranteed)),rolls:Math.max(...parts.map(p=>p.rolls)),chance:positive.length?positive.reduce((a,b)=>a+b,0)/positive.length:0,entries:mergeOps(parts.map(p=>p.entries))};
 });
}
function context(options={}){
 const source=sources.get(options.source)||D.sources.find(s=>s.id==='SW.LootActor.FancyChest');
 const area=areas.get(options.area)||D.areas.find(a=>a.id==='SW.Area.Plains.A1');
 const extra=options.contextTags||[];
 const profiles=[source,...extra.map(id=>sources.get(id)||D.contexts?.[id]).filter(Boolean),area];
 const level=Math.trunc(clamp(options.level??20,1,20)),difficulty=options.difficulty||'SW.Difficulty.Normal';
 return {source,area,level,difficulty,slots:combineSlots(profiles),rarityContext:mergeOps([...profiles.map(p=>p.rarity||[]),D.difficulty[difficulty]||[],...(options.rarityRules||[])]),skipSkew:[...(source.context_tags||[]),...extra].includes('SW.ItemCreator.Rarity.SkipThreatBasedRaritySkewing'),rarityBonus:clamp(options.rarityBonus),dropIncrease:clamp(options.dropIncrease),looting:clamp(options.looting),extraRolls:Math.trunc(clamp(options.extraRolls??1,0,20)),histories:options.histories||{'SW.LootSlot.Item':options.history||[],'SW.LootSlot.EnchantedBook':options.bookHistory||[]},owned:new Set((options.owned||[]).map(itemId)),rarity:options.rarity||'any'};
}
function rarityWeights(item,ctx){
 const allowed=new Set(item.rarities),entries=mergeOps([ctx.rarityContext,item.rarity]).filter(e=>allowed.has(e.target));
 let weights=evaluateWeights(entries),positive=[...weights].filter(([,w])=>w>0);
 if(positive.length>1&&!ctx.skipSkew){
  const curve=D.rarity_curves[ctx.level-1].rarity;
  weights=evaluateWeights(entries,id=>curve[id.split('.').at(-1)]??1);
 }
 let total=[...weights.values()].reduce((a,b)=>a+b,0);
 const probabilities=new Map(total?[...weights].map(([id,w])=>[id,w/total]):[['SW.Rarity.Common',1]]);
 if(ctx.rarityBonus){
  const common=probabilities.get('SW.Rarity.Common')||0,rare=probabilities.get('SW.Rarity.Rare')||0;
  for(const [from,to,p] of [['SW.Rarity.Common','SW.Rarity.Rare',common],['SW.Rarity.Rare','SW.Rarity.Special',rare]]){
   if(entries.some(e=>e.target===to)){
    probabilities.set(from,(probabilities.get(from)||0)-p*ctx.rarityBonus);
    probabilities.set(to,(probabilities.get(to)||0)+p*ctx.rarityBonus);
   }
  }
 }
 return probabilities;
}
function chanceForBase(base,target,ctx){
 const probabilities=rarityWeights(base,ctx);
 let chance=0;
 for(const [rarity,p] of probabilities){
    const finalId=itemId(rarity==='SW.Rarity.Unique'&&!base.unique&&base.substitute?base.substitute:base.id);
  if(finalId===target&&(ctx.rarity==='any'||ctx.rarity===rarity))chance+=p;
 }
 return chance;
}
function slotChance(slot,target,ctx){
 const rule=D.slot_rules[slot.id]||{},repeat=(rule.modifiers||[]).includes('SW.LootModificationFunction.PreventRepeatingDrops'),unique=(rule.modifiers||[]).includes('SW.LootModificationFunction.PreventDuplicateOneOfAKindDrops');
 const pool=[...evaluateWeights(slot.entries)].filter(([id,w])=>w>0&&D.items[id]).map(([id,w])=>({item:D.items[id],weight:w,hit:chanceForBase(D.items[id],target,ctx)}));
 const rawTotal=pool.reduce((n,e)=>n+e.weight,0),rawHit=rawTotal?pool.reduce((n,e)=>n+e.weight*e.hit,0)/rawTotal:0;
 const probability=clamp(slot.chance+(rule.modify_chance?ctx.dropIncrease:0));
 const bonus=rule.additional?ctx.looting:0,bonusRolls=rule.additional?ctx.extraRolls:0;
 const recent=(ctx.histories[slot.id]||[]).filter(Boolean).map(id=>D.items[itemId(id)]?.group||id).slice(0,rule.history||0);
 const owned=ctx.owned;
 const keyFor=e=>unique&&e.item.one_of_a_kind?e.item.id:e.item.group;
 const memo=new Map();
 let visits=0;
 function finish(successes){return Math.pow(1-bonus*rawHit,successes*bonusRolls);}
 function noHit(randomLeft,guaranteedLeft,history,generated,successes){
  const key=[randomLeft,guaranteedLeft,successes,history.join(','),generated.join(',')].join('|');
  if(memo.has(key))return memo.get(key);
  visits++;
  if(!randomLeft&&!guaranteedLeft)return finish(successes);
  const available=pool.filter(e=>(!repeat||!history.includes(e.item.group))&&(!unique||!e.item.one_of_a_kind||(!owned.has(e.item.id)&&!generated.includes(e.item.id))));
  const groups=new Map();
  for(const e of available){
   const key=keyFor(e),g=groups.get(key)||{weight:0,hitWeight:0,history:e.item.group,owned:unique&&e.item.one_of_a_kind?e.item.id:null};
   g.weight+=e.weight;g.hitWeight+=e.weight*e.hit;groups.set(key,g);
  }
  const total=available.reduce((n,e)=>n+e.weight,0);
  const pick=(nextRandom,nextGuaranteed,nextSuccesses)=>{
   if(!total)return finish(nextSuccesses);
   let sum=0;
   for(const g of groups.values()){
    const keep=g.weight-g.hitWeight;
    if(keep<=0)continue;
    const nextHistory=rule.history?[g.history,...history].slice(0,rule.history):[];
    const nextGenerated=g.owned?[...generated,g.owned].sort():generated;
    sum+=keep/total*noHit(nextRandom,nextGuaranteed,nextHistory,nextGenerated,nextSuccesses);
   }
   return sum;
  };
  let value;
  if(randomLeft){
   value=(probability<1?(1-probability)*noHit(randomLeft-1,guaranteedLeft,history,generated,successes):0)+(probability>0?probability*pick(randomLeft-1,guaranteedLeft,successes+1):0);
  }else value=pick(0,guaranteedLeft-1,successes);
  memo.set(key,value);return value;
 }
 let chance=0;
 if(rawHit>0&&rawTotal&&(slot.guaranteed||slot.rolls))chance=clamp(1-noHit(slot.rolls,slot.guaranteed,recent,[],0));
 const firstPool=pool.filter(e=>(!repeat||!recent.includes(e.item.group))&&(!unique||!e.item.one_of_a_kind||!owned.has(e.item.id)));
 const firstTotal=firstPool.reduce((n,e)=>n+e.weight,0);
 const firstChance=firstTotal?firstPool.reduce((n,e)=>n+e.weight*e.hit,0)/firstTotal:0;
 return {id:slot.id,chance,firstChance,guaranteed:slot.guaranteed,rolls:slot.rolls,rollChance:probability,poolSize:pool.length,eligibleSize:firstPool.length,history:rule.history||0,repeat,unique,baseHit:rawHit,states:visits,pool:firstPool.map(e=>({id:e.item.id,name:e.item.name,weight:e.weight,selection:e.weight/firstTotal,targetFraction:e.hit}))};
}
function calculate(target,options={}){
 target=itemId(target);
 const key=JSON.stringify([target,options]);if(cache.has(key))return cache.get(key);
 const ctx=context(options),slots=ctx.slots.filter(s=>s.id!=='None'&&(s.guaranteed||s.rolls)).map(s=>slotChance(s,target,ctx));
 const result={target,chance:clamp(1-slots.reduce((value,s)=>value*(1-s.chance),1)),slots,source:ctx.source.id,area:ctx.area.id,level:ctx.level,difficulty:ctx.difficulty};
 if(cache.size>400)cache.clear();cache.set(key,result);return result;
}
function percent(value){
 if(value===0)return '0%';if(value>=1-1e-12)return '100%';
 if(value<5e-9)return '<0.000001%';
 return (value*100).toLocaleString('zh-CN',{maximumFractionDigits:6})+'%';
}
window.LootMath=Object.freeze({context,calculate,slotChance,rarityWeights,mergeOps,evaluateWeights,combineSlots,percent});
})();
