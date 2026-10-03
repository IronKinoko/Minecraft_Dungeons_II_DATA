(()=>{'use strict';
const D=window.ATLAS_DATA,$=s=>document.querySelector(s),E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const F=new Map(D.resolved_affixes.map(x=>[x.id.toLowerCase(),x])),I=new Map(D.items.map(x=>[x.id.toLowerCase(),x])),L=new Map(D.loot.map(x=>[x.id,x])),Q=new Map(D.quests.map(x=>[x.id,x]));
const R=new Map(D.affix_reverse_index.map(x=>[x.id.toLowerCase(),x]));
const cats=['全部装备','独特装备','近战武器','远程武器','护甲','法器','附魔书','护符','其他物品'];
const rarityLabels={Common:'普通',Rare:'稀有',Special:'卓越',Unique:'独特',None:'无稀有度'};
const rlabel=t=>rarityLabels[t.split('.').at(-1)]??t;
const state={view:'items',category:'全部装备',query:'',searchDescriptions:false,rarity:'all',sort:'source',page:1,curve:10,item:null,detailTab:'effects'};
try{state.searchDescriptions=localStorage.getItem('gear-atlas.search-descriptions')==='true';}catch{}
Object.assign(state,{reverseEffect:'SW.Effect.FireFocus',reverseMode:'all',reverseScope:'all',probItem:'SW.Item.Sword_Unique1',probRarity:'',probExtra:false,probFamily:''});
$('#template-count').textContent=D.meta.affixes;
const sourceLink=s=>{const [file,row]=s.split('#');return `<a class="source-link" href="data/raw/${encodeURIComponent(file)}" target="_blank" rel="noopener">${E(file)}${row?' · '+E(row):''} ↗</a>`};
const img=(src,alt,cls='')=>src?`<img src="${E(src)}" alt="${E(alt)}" class="${cls}" loading="lazy">`:'';
const tdTable=(headers,rows)=>`<div class="table-wrap"><table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${x??''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const tierLabel=t=>({'1':'I','2':'II','3':'III','4':'IV'}[t]??t??'');
const effectText=id=>{const a=F.get(id.toLowerCase());return a?`${a.name} ${tierLabel(a.tier)}`:id};
const effectDesc=a=>a.effect_text||a.description;
const effectHtml=a=>`<div class="effect-description">${E(effectDesc(a))}</div>`;
const afRow=a=>`<div class="effect-row">${img(a.icon,a.name)}<div><strong>${E(a.name)} <span class="pill gold">${E(tierLabel(a.tier))}</span></strong><p class="effect-description">${E(effectDesc(a))}</p></div></div>`;
const slotLabel=s=>({'MeleeWeapon':'近战武器','RangedWeapon':'远程武器','Armor.Boots':'靴子','Armor.Chest':'胸甲','Armor.Helmet':'头盔','Armor.Leggings':'护腿','Artifact':'法器'}[s.replace('SW.ItemSlot.Equipment.','')]??s.replace('SW.ItemSlot.Equipment.',''));
const categoryItems=cat=>D.items.filter(i=>cat==='全部装备'||cat==='独特装备'&&i.unique||cat==='其他物品'&&['披风','宠物','投掷物'].includes(i.category)||i.category===cat);
const normalize=s=>s.toLocaleLowerCase().replace(/\s+/g,'');
const pct=v=>v===0?'0%':v===1?'100%':v>0&&v<.0001?'<0.01%':(v*100).toFixed(2)+'%';
function probabilityCase(item,defaults=false){const p=item.probability;if(!p)return null;const rarity=!defaults&&p.models[state.probRarity]?state.probRarity:p.default_rarity;const slots=p.slots[rarity]+(!defaults&&state.probExtra?p.bonus_slots[rarity]:0);const model=D.probability_models[p.models[rarity]];return {rarity,slots,model,p};}
function templateProbability(item,tid,level,defaults=false){const c=probabilityCase(item,defaults);if(!c)return null;if(c.p.fixed.some(t=>t.toLowerCase()===tid.toLowerCase()))return 1;const n=c.model.entries.findIndex(e=>e.id.toLowerCase()===tid.toLowerCase());return n<0||!c.slots?0:c.model.by_slots[String(c.slots)][n][level-1];}
const searchIndex=new Map(D.items.map(i=>[i.id,normalize([i.name,i.name_en,i.id,i.category,i.subtype,...i.fixed_effects.map(effectText),...i.affixes.map(a=>effectText(a.id))].join(' '))]));
const descriptionIndex=new Map(D.items.map(i=>{
 const records=[];
 const add=(label,text)=>{if(text)records.push({label,text,index:normalize(text)});};
 const addEffect=(label,id)=>{const a=F.get(id.toLowerCase());if(a)add(`${label} · ${effectText(id)}`,effectDesc(a));};
 i.fixed_effects.forEach(id=>addEffect('固有词条',id));
 i.levels.forEach(l=>l.effects.forEach(id=>addEffect(`护符 ${l.level} 级`,id)));
 const book=F.get(i.associated_enchantment?.toLowerCase());
 if(book){const tiers=D.resolved_affixes.filter(a=>a.kind==='附魔'&&a.effect_id.toLowerCase()===book.effect_id.toLowerCase());(tiers.length?tiers:[book]).forEach(a=>addEffect('附魔书效果',a.id));}
 if(!/\{\d+\}/.test(i.description)||!records.length)add('装备介绍',i.description);
 i.affixes.forEach(a=>addEffect('可随机词条',a.id));
 return [i.id,records];
}));
const effectDescriptionIndex=new Map(D.affix_reverse_index.map(entry=>[entry.id,normalize(D.resolved_affixes.filter(a=>a.effect_id.toLowerCase()===entry.id.toLowerCase()).map(effectDesc).join(' '))]));
const descriptionMatch=i=>state.searchDescriptions&&normalize(state.query)?descriptionIndex.get(i.id).find(r=>r.index.includes(normalize(state.query))):null;
function searchExcerpt(i){
 const match=descriptionMatch(i);if(!match)return '';
 const query=state.query.trim(),at=match.text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()),start=Math.max(0,at-22),end=Math.min(match.text.length,Math.max(0,at)+query.length+50);
 const text=match.text.slice(start,end),offset=at-start;
 const excerpt=at>=0?E(text.slice(0,offset))+`<mark>${E(text.slice(offset,offset+query.length))}</mark>`+E(text.slice(offset+query.length)):E(text);
 return `<div class="search-excerpt"><span class="search-match-label">${E(match.label)}</span><span>${start?'…':''}${excerpt}${end<match.text.length?'…':''}</span></div>`;
}
$('#categories').innerHTML=cats.map((cat,n)=>`<button data-category="${cat}" class="${n===0?'active':''}"><span>${cat}</span><span class="count">${categoryItems(cat).length}</span></button>`).join('');
const feature=[D.items.find(x=>x.id==='SW.Item.WarHammer_Unique1'),D.items.find(x=>x.category==='护甲'&&x.unique&&x.subtype==='头盔'),D.items.find(x=>x.category==='法器'&&x.id.includes('Firework'))].filter(Boolean);
$('#hero-art').innerHTML='<div class="plinth"></div>'+feature.map(i=>img(i.icon,'')).join('');

function filtered(){let rows=categoryItems(state.category).filter(i=>(state.rarity==='all'||state.rarity==='unique'&&i.unique||state.rarity==='regular'&&!i.unique)&&(!state.query||searchIndex.get(i.id).includes(normalize(state.query))||descriptionMatch(i)));if(state.sort==='name')rows.sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));if(state.sort==='unique')rows.sort((a,b)=>Number(b.unique)-Number(a.unique));return rows;}
function pagination(total,size){const pages=Math.ceil(total/size);if(pages<2)return '';return `<div class="pagination"><button data-page="${state.page-1}" ${state.page===1?'disabled':''}>上一页</button><span>${state.page} / ${pages}</span><button data-page="${state.page+1}" ${state.page===pages?'disabled':''}>下一页</button></div>`;}
function renderItems(){const all=filtered(),size=48;state.page=Math.min(state.page,Math.max(1,Math.ceil(all.length/size)));$('#result-count').textContent=`${all.length} 个条目`;return all.length?`<div class="grid">${all.slice((state.page-1)*size,state.page*size).map(i=>`<button class="item-card ${i.unique?'unique':''}" data-item="${E(i.id)}" aria-label="查看${E(i.name)}"><div class="card-art"><span class="card-tag">${i.unique?'独特':E(i.subtype)}</span><span class="card-number">${String(D.items.indexOf(i)+1).padStart(3,'0')}</span>${img(i.icon,i.name)}</div><div class="card-info"><h3>${E(i.name)}</h3><div class="en">${E(i.name_en)}</div>${searchExcerpt(i)}<div class="meta"><span>${E(i.subtype)}</span><span>${i.unique?'查看固定词条 ↗':i.category==='护符'?'查看成长效果 ↗':i.category==='附魔书'?'查看适用部位 ↗':'查看装备档案 ↗'}</span></div></div></button>`).join('')}</div>${pagination(all.length,size)}`:`<div class="empty">没有找到符合条件的条目。${state.searchDescriptions?'试试其他关键词，或调整装备分类与稀有度。':'试试装备名、英文名或词条名称，也可开启“搜索描述”查找效果关键词。'}</div>`;}
function reverseCounts(entry,scope=state.reverseScope){
 const include=x=>{const i=I.get(x.item.toLowerCase());return scope==='all'||scope==='unique'&&i.unique||i.category===scope;};
 return {fixed:['fixed','growth','enchantment'].flatMap(type=>(entry[type]||[]).filter(include).map(x=>({...x,type}))),random:entry.random.filter(include).map(x=>({...x,type:'random'}))};
}
function renderReverse(){
 const scopes=[['all','全部装备'],['unique','仅独特装备'],...['近战武器','远程武器','护甲','法器','附魔书','护符'].map(x=>[x,x])];
 const scopeSelector=`<label>装备范围<select id="reverse-scope">${scopes.map(([v,t])=>`<option value="${v}" ${v===state.reverseScope?'selected':''}>${t}</option>`).join('')}</select></label>`;
 const options=D.affix_reverse_index.filter(x=>{const c=reverseCounts(x);return (c.fixed.length||c.random.length)&&(!state.query||normalize(x.name+' '+x.name_en+' '+x.id+' '+x.aliases.join(' ')).includes(normalize(state.query))||state.searchDescriptions&&effectDescriptionIndex.get(x.id).includes(normalize(state.query)));}).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
 if(!options.length){$('#result-count').textContent='0 个词条';return `<div class="reverse-controls">${scopeSelector}</div><div class="empty">当前装备范围内没有匹配词条。可更换分类或清空搜索词。</div>`;}
 const chosen=options.find(x=>x.id.toLowerCase()===state.reverseEffect.toLowerCase())??options[0];state.reverseEffect=chosen.id;
 const c=reverseCounts(chosen),matches=new Map();
 for(const mode of ['fixed','random'])if(state.reverseMode==='all'||state.reverseMode===mode)for(const match of c[mode]){if(!matches.has(match.item))matches.set(match.item,[]);matches.get(match.item).push(match);}
 $('#result-count').textContent=`${matches.size} 件${state.reverseScope==='unique'?'独特装备':'装备'}`;
 const labels={fixed:'装备固有',random:'可随机',growth:'护符成长',enchantment:'附魔书效果'};
 return `<div class="reverse-controls">${scopeSelector}<label class="reverse-affix-select">选择词条<select id="reverse-effect">${options.map(o=>{const n=reverseCounts(o);return `<option value="${E(o.id)}" ${o===chosen?'selected':''}>${E(o.name)} · 固有 ${n.fixed.length} / 随机 ${n.random.length}</option>`;}).join('')}</select></label><div class="segmented" aria-label="词条关系">${[['fixed','固有效果'],['random','可随机出现'],['all','两者都看']].map(([v,t])=>`<button data-reverse-mode="${v}" class="${state.reverseMode===v?'active':''}">${t}</button>`).join('')}</div></div><div class="reverse-summary">${img(chosen.icon,chosen.name)}<div><h3>${E(chosen.name)}</h3><p>固有／成长／附魔：${c.fixed.length} 件　·　随机候选：${c.random.length} 件</p></div><button class="text-action" data-effect-dictionary="${E(chosen.name)}">查看各阶级效果 ↗</button></div><div class="notice">默认搜索全部装备，可单独筛选独特或装备类别。“固有效果”包括装备必带、护符成长和附魔书效果，各阶级不表示同时生效；“可随机出现”列出随机词条候选。按效果名称跨阶级匹配。</div>${matches.size?`<div class="grid">${[...matches].map(([id,types])=>{const i=I.get(id.toLowerCase());return `<button class="item-card ${i.unique?'unique':''}" data-item="${E(id)}" data-match-family="${E(chosen.id)}"><div class="card-art"><span class="card-tag">${i.unique?'独特 · ':''}${E(i.subtype)}</span>${img(i.icon,i.name)}</div><div class="card-info"><h3>${E(i.name)}</h3><div class="en">${E(i.name_en)}</div>${types.map(t=>`<div class="match-note ${t.type!=='random'?'fixed':''}">${labels[t.type]} · ${t.templates.map(tid=>E(tierLabel(F.get(tid.toLowerCase()).tier))).join(' / ')}</div>`).join('')}<div class="meta"><span>${E(chosen.name)}</span><span>${i.probability?'效果与逐级概率':'查看各阶级效果'} ↗</span></div></div></button>`;}).join('')}</div>`:'<div class="empty">没有符合当前关系的装备。可切换“固有效果”“可随机出现”或“两者都看”。</div>'}`;
}
function probabilityPanel(item,global=false){
 const c=probabilityCase(item);if(!c)return '<div class="notice">这类物品的效果由附魔阶级或护符自身等级确定，不从装备的随机词条池抽取。可在“属性与词条”查看各级固定效果。</div>';
 const families=new Map();
 for(const tid of [...c.p.fixed,...c.model.entries.map(e=>e.id)]){const a=F.get(tid.toLowerCase());if(!a)continue;const key=a.effect_id.toLowerCase();if(!families.has(key))families.set(key,{id:a.effect_id,name:R.get(key)?.name??a.name,entries:[]});families.get(key).entries.push(a);}
 const opts=[...families.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));let selected=families.get(state.probFamily.toLowerCase())??opts.find(x=>x.name==='锋利')??opts[0];
 if(!selected)return '<div class="notice">该条件下没有可计算的词条。</div>';
 state.probFamily=selected.id;const entries=selected.entries.sort((a,b)=>(Number(a.tier)||4)-(Number(b.tier)||4));
 const fixed=entries.every(a=>c.p.fixed.includes(a.id));
 const controls=`<div class="probability-controls"><label>稀有度<select id="prob-rarity">${Object.keys(c.p.models).map(r=>`<option value="${E(r)}" ${r===c.rarity?'selected':''}>${E(rlabel(r))}</option>`).join('')}</select></label><label>选择词条<select id="prob-family">${opts.map(f=>`<option value="${E(f.id)}" ${f.id===selected.id?'selected':''}>${E(f.name)}${f.entries.every(a=>c.p.fixed.includes(a.id))?'（必带）':''}</option>`).join('')}</select></label><label class="bonus-check"><input id="prob-extra" type="checkbox" ${state.probExtra?'checked':''} ${!c.p.bonus_slots[c.rarity]?'disabled':''}>额外词条奖励</label></div>`;
 return `${global?`<label class="prob-item-label">装备<select id="prob-item">${['近战武器','远程武器','护甲','法器'].map(cat=>`<optgroup label="${cat}">${D.items.filter(i=>i.category===cat).map(i=>`<option value="${E(i.id)}" ${i.id===item.id?'selected':''}>${E(i.name)}${i.unique?' · 独特':''}</option>`).join('')}</optgroup>`).join('')}</select></label>`:''}${controls}<div class="probability-context"><span>${E(item.name)}</span><span>${E(rlabel(c.rarity))}</span><span>随机词条 ${c.slots} 个</span><span>${fixed?'所选词条必带':'计算至少出现一次的概率'}</span></div><div class="notice gold">以这件装备已经生成为前提，下表是<strong>词条概率，不是装备掉率</strong>。等级轴是生成时责任玩家的当前威胁等级，角色等级不能单独决定概率。</div>${tdTable(['威胁等级',...entries.map(a=>`${E(tierLabel(a.tier)||'固定')} 阶`),'任一阶级'],D.probability_rules.levels.map(level=>{const values=entries.map(a=>templateProbability(item,a.id,level));return [`<span class="threat-number ${level===state.curve?'selected':''}">${level}</span>`,...values.map(v=>`<span class="prob-value ${v===0?'zero':''}">${pct(v)}</span>`),`<strong class="prob-value">${pct(Math.min(1,values.reduce((a,b)=>a+b,0)))}</strong>`];}))}<details class="calculation-details"><summary>计算规则与适用条件</summary><p>${E(D.probability_rules.formula)}</p><p>${E(D.probability_rules.multi_slot)}</p><p>${E(D.probability_rules.bonus)}</p><p>${E(D.probability_rules.limits)}</p><p><a class="source-link" href="data/csv/逐级词条概率.csv" download>下载全部装备的逐级概率 CSV ↗</a></p></details>`;
}
function reverseActions(a){const entry=R.get(a.effect_id.toLowerCase());if(!entry)return '—';const n=reverseCounts(entry,'all');return `${n.fixed.length?`<button class="text-action" data-reverse-family="${E(entry.id)}" data-reverse-kind="fixed">固有 ${n.fixed.length} 件 ↗</button>`:''}${n.random.length?`<button class="text-action" data-reverse-family="${E(entry.id)}" data-reverse-kind="random">可随机 ${n.random.length} 件 ↗</button>`:''}${!n.fixed.length&&!n.random.length?'<span class="small">未关联装备</span>':''}`;}
function renderAffixes(){
 const list=D.affixes.filter(a=>!state.query||normalize(a.name+' '+a.name_en+' '+a.id+(state.searchDescriptions?' '+effectDesc(a):'')).includes(normalize(state.query)));
 const size=60;state.page=Math.min(state.page,Math.max(1,Math.ceil(list.length/size)));$('#result-count').textContent=`${list.length} 条模板`;
 return `<div class="notice">每条词条均列出中文效果与对应阶级数值，包括触发方式、次数、持续时间和已配置的触发冷却。数值按当前游戏数据整理，原始定义可回查。</div>${tdTable(['词条','阶级','效果说明','类型','最低装备强度','限制与出处','反查装备'],list.slice((state.page-1)*size,state.page*size).map(a=>[
  `<div class="affix-name">${img(a.icon,a.name)}<span>${E(a.name)}</span></div>`,
  `<span class="pill ${a.tier==='独特'?'gold':''}">${E(tierLabel(a.tier))}</span>`,effectHtml(a),E(a.kind),a.min_item_power,
  `${a.exclusions.length?`<details><summary>${a.exclusions.length} 条排斥规则</summary><div class="mono">${a.exclusions.map(q=>E(q.query.AutoDescription)).join('<br>')}</div></details>`:'—'}${sourceLink(a.source)}`,reverseActions(a)
 ]))}${pagination(list.length,size)}`;
}
function curveTable(){return tdTable(['参数','I 阶因子','II 阶因子','III 阶因子','普通','稀有','卓越','独特'],D.threat.map(t=>[t.input,...['Tier1Effects','Tier2Effects','Tier3Effects'].map(k=>t.effects[k].toFixed(2)),...['Common','Rare','Special','Unique'].map(k=>t.rarity[k].toFixed(2))]));}
function renderCurves(){
 const preferred=I.get(state.probItem.toLowerCase());const item=preferred?.probability?preferred:D.items.find(i=>i.unique&&i.probability);state.probItem=item.id;
 const t=D.threat[state.curve-1];$('#result-count').textContent='威胁 1–20 · 条件概率';
 return `<div class="panel probability-explorer"><h3>选择装备与词条</h3>${probabilityPanel(item,true)}</div><div class="panel"><h3>当前威胁的阶级修正</h3><p>II 阶从威胁 3 起有正权重，III 阶从威胁 6 起有正权重。威胁 20 时 I 阶随机词条权重为 0；必带词条不受这项随机阶级筛选影响。</p><div class="controls"><label for="curve-input">当前威胁</label><input id="curve-input" type="range" min="1" max="20" value="${state.curve}"><output id="curve-output">${state.curve}</output></div><div class="factor-grid">${['Tier1Effects','Tier2Effects','Tier3Effects'].map((key,i)=>`<div class="factor-box"><b>${t.effects[key].toFixed(2)}</b><span>${['I','II','III'][i]} 阶词条权重因子</span></div>`).join('')}</div><p>这些因子需要与当前装备候选池共同计算，不能单独当作概率。多词条装备按“不重复效果”的抽取过程计算至少出现一次的概率。</p></div><details><summary class="source-link">查看阶级与稀有度原始曲线</summary>${curveTable()}</details>`;
}
function renderLoot(){const list=D.loot.filter(l=>!state.query||normalize(l.name+' '+l.id+' '+JSON.stringify(l.slots)).includes(normalize(state.query)));$('#result-count').textContent=`${list.length} 类来源`;return `<div class="notice">保底次数和随机次数描述掉落槽的触发。目标物品还需从对应池中选取，并满足稀有度及其他条件；“保底 1 次”不等于必出当前查看的装备。</div>${list.map(l=>`<details class="source-block"><summary><strong>${E(l.name)}</strong> <span class="pill">${E(l.kind)}</span> <span class="small">${l.slots.length} 个槽</span></summary><div class="mono small">${E(l.id)}</div>${l.slots.map(sl=>`<h4>${E(sl.id.replace('SW.LootSlot.',''))}</h4><p>保底 ${sl.guaranteed} 次　随机 ${sl.rolls} 次　随机触发率 ${sl.rolls?(sl.chance*100).toFixed(2)+'%':'—（没有随机判定）'}　${sl.inherit?'继承父掉落池':'不继承父掉落池'}</p>${sl.entries.length?tdTable(['目标标签','权重／乘数','操作'],sl.entries.map(e=>[E(e.target),e.weight,E(e.operation)])):'<p>此槽没有直接池条目。</p>'}`).join('')}${!l.slots.length?'<p>此行没有直接掉落槽，可能依赖父级或上下文。</p>':''}${sourceLink(l.source)}</details>`).join('')}`;}
function renderAbout(){$('#result-count').textContent='来源可追溯';const blocks=[['当前收录',`${D.meta.items} 个物品条目，${D.meta.unique} 件独特。核心装备、武器、法器、附魔书与护符共 328 件，另收录 11 件披风、宠物与投掷物。8 个没有独立物品图标的分类模板保留在数据档案中。`],['词条如何对应装备',D.meta.method_note],['等级字段',D.meta.level_note],['概率字段',D.meta.probability_note],['任务与独特替换','基础装备中的 UniqueSubstitution 定义指向独特变体。首次完成奖励、可重玩标志和前置任务分别保留。区域随机奖励的关联只表示候选关系，不表示任务会发放全部候选物品。'],['地图与任务','3 张大地图、23 张室内地图和 846 个随机房间／连接模板，包含 12,756 个玩法点位及 44 条任务。固定摆放、随机候选与生成房间分别标注；清单进度保存在浏览器。'],['尚未确认','已提供物品的条件掉落概率；联机动态缩放、快照之后的在线变更及未提取的脚本上下文仍待核验。近期掉落和已拥有物品可在计算器中填写。7 件披风和 3 件宠物的获取方式尚未定位。']];return `<div class="notice">引擎：${E(D.meta.engine)}　游戏配置版本：${D.meta.version}　读取 ${D.meta.archive_files.toLocaleString()} 个文件索引　原始图标：505 / 505 成功解码</div><div class="about-grid">${blocks.map(([t,b])=>`<div class="panel"><h3>${t}</h3><p>${E(b)}</p></div>`).join('')}</div><div class="panel" style="margin-top:20px"><h3>下载与原始依据</h3><p><a class="source-link" href="outputs/2026-09-30/Minecraft_Dungeons_II_装备档案.xlsx">Excel 分类档案（26 个工作表） ↗</a></p><p><a class="source-link" href="data/catalog.json">完整结构化档案 JSON ↗</a>　<a class="source-link" href="data/coverage.json">覆盖与待核验记录 ↗</a>　<a class="source-link" href="data/csv/装备总表.csv">物品 CSV ↗</a></p><p>所有名称与图标均来自当前安装资源。表格导出保留文件名与行名，可以回查 data/raw 下的原始定义。</p></div>`;}
function render(){
 const itemview=state.view==='items';$('#hero').hidden=!itemview;$('#rarity').parentElement.hidden=!itemview;$('#sort').parentElement.hidden=!itemview;$('#toolbar').hidden=['curves','drops','about'].includes(state.view);
 $('#search-description-control').hidden=!['items','reverse','affixes'].includes(state.view);$('#search-descriptions').checked=state.searchDescriptions;
 $('#search').placeholder=state.searchDescriptions&&['items','reverse','affixes'].includes(state.view)?'搜索名称、ID 或描述关键词，如“毒”…':state.view==='reverse'?'搜索要反查的词条名称、英文名或 ID…':'搜索装备、词条、名称或 ID…';
 if(state.view==='world')$('#search').placeholder='搜索宝箱、地牢、护符、角色或区域…';
 if(state.view==='quests')$('#search').placeholder='搜索任务名、区域、目标或 ID…';
 $('#section-title').textContent=itemview?state.category:({reverse:'按词条寻找装备',affixes:'词条辞典',curves:'逐级词条概率',drops:'查询物品掉落概率',world:'地图与探索点位',quests:'主线与支线任务清单',loot:'原始掉落规则',about:'档案说明'}[state.view]);
 $('#section-kicker').textContent=({items:'THE COLLECTION',reverse:'FIND YOUR EQUIPMENT',affixes:'ENCHANTMENTS & EFFECTS',curves:'AFFIX PROBABILITIES',drops:'FIND YOUR NEXT DROP',world:'THE WORLD ATLAS',quests:'THE QUEST JOURNAL',loot:'SOURCES OF LOOT',about:'ABOUT THE ARCHIVE'}[state.view]);
 $('#view-content').innerHTML=({items:renderItems,reverse:renderReverse,affixes:renderAffixes,curves:renderCurves,drops:()=>AtlasExplorers.renderDrops(),world:()=>AtlasExplorers.renderWorld(state.query),quests:()=>AtlasExplorers.renderQuests(state.query),loot:renderLoot,about:renderAbout}[state.view])();
 $('#views').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));$('#categories').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.category===state.category&&itemview));
 AtlasExplorers.mount(state.view);
}

function detailEffects(i){
 let result='';
 if(i.fixed_effects.length)result+='<h3>必带固定词条</h3>'+i.fixed_effects.map(id=>F.get(id.toLowerCase())).filter(Boolean).map(afRow).join('');
 if(i.levels.length)result+='<h3>护符成长</h3>'+i.levels.map(l=>`<div class="level-row">${img(l.icon,i.name+' '+l.level+'级')}<div><h4>${l.level} 级</h4><p>${l.effects.map(effectText).map(E).join('、')}</p><p class="effect-description">${l.effects.map(id=>F.get(id.toLowerCase())).filter(Boolean).map(a=>E(effectDesc(a))).join('<br>')}</p><p>${l.xp_next?'升至下一级：'+l.xp_next.toLocaleString()+' 经验':'最高等级；升级经验字段为 0'}</p></div></div>`).join('');
 if(i.associated_enchantment){const a=F.get(i.associated_enchantment.toLowerCase());if(a){
  const tiers=D.resolved_affixes.filter(v=>v.kind==='附魔'&&v.effect_id.toLowerCase()===a.effect_id.toLowerCase()&&[1,2,3].includes(v.tier)).sort((a,b)=>a.tier-b.tier);
  result+='<h3>关联附魔 · 各阶级效果</h3>'+`<p class="small">适用槽位：${a.slots.map(s=>E(slotLabel(s))).join('、')}</p>`+tdTable(['阶级','效果说明'],(tiers.length?tiers:[a]).map(v=>[tierLabel(v.tier),effectHtml(v)]))+`<p>${sourceLink(a.source)}</p>`;
 }}
 if(i.affixes.length){
  const t=D.threat[state.curve-1];const candidates=i.affixes.map(r=>({r,a:F.get(r.id.toLowerCase())})).filter(({a})=>a&&(![1,2,3].includes(a.tier)||t.effects['Tier'+a.tier+'Effects']>0));
  result+=`<h3>随机词条候选</h3><div class="notice">由装备标签、词条池及排斥查询得到的静态候选。下列概率按当前威胁、默认稀有度与普通奖励计算；已移除同效果的固定词条。点击词条名称可查看全部等级。</div><div class="controls"><label for="detail-curve">当前威胁等级</label><select id="detail-curve">${D.threat.map(t=>`<option value="${t.input}" ${t.input===state.curve?'selected':''}>威胁 ${t.input}</option>`).join('')}</select><span class="small">${candidates.length} / ${i.affixes.length} 条模板有正阶级权重</span></div>${tdTable(['词条','阶级','效果说明','出现概率','阶级因子','池内依据'],candidates.map(({r,a})=>[`<button class="text-action" data-probability-family="${E(a.effect_id)}">${E(a.name)} ↗</button>`,tierLabel(a.tier),effectHtml(a),`<strong class="prob-value">${pct(templateProbability(i,a.id,state.curve,true))}</strong>`,t.effects['Tier'+a.tier+'Effects']??'—',`<details><summary>${r.pools.length} 个池</summary>${r.pools.map(p=>`<div class="small mono">${E(p.group)}<br>池权重 ${p.group_weight} · 模板权重 ${p.template_weight}</div>`).join('')}</details>`]))}<p class="small">最低装备强度字段为 0。筛选值为当前威胁等级；同一效果已有固定词条或已经被抽到后，不再抽取它的其他阶级。</p>`;
 }
 if(i.enchantments.length){const entries=i.enchantments.map(id=>F.get(id.toLowerCase())).filter(Boolean);result+=`<details><summary>可适用附魔及效果（${entries.length}）</summary>${tdTable(['附魔','阶级','效果说明'],entries.map(a=>[E(a.name),tierLabel(a.tier),effectHtml(a)]))}</details>`;}
 if(!result)result='<div class="notice">没有独立随机词条池或固定效果记录。原始定义仍完整保留。</div>';
 return result;
}
function detailSources(i){const area=[...new Set(i.sources.filter(x=>L.get(x.source_id)?.kind==='区域').map(x=>L.get(x.source_id).name))];let text=AtlasExplorers.itemSourceSummary(i);if(i.base_item){const b=I.get(i.base_item.toLowerCase());text+=`<div class="source-block"><h4>独特替换</h4><p>基础装备：<a class="source-link" href="#" data-item="${E(b.id)}">${E(b.name)}</a>。基础定义中的独特替换字段指向本件装备。需同时满足独特稀有度生成规则。</p></div>`;}if(area.length)text+=`<h3>区域物品池</h3><p>${area.map(x=>`<span class="pill">${E(x)}</span>`).join('')}</p>`;
const specific=i.quests.filter(q=>q.source_ids.some(id=>L.get(id)?.kind==='任务')||q.direct_item);if(specific.length)text+='<h3>指定任务奖励关联</h3>'+specific.map(r=>{const q=Q.get(r.quest);return `<div class="source-block"><h4>${E(q?.name??r.quest)} <span class="pill gold">${E(r.phase)}</span></h4><p>前置任务：${q.prerequisites.length?q.prerequisites.map(p=>E(Q.get(p)?.name??p)).join('、'):'此 JSON 未列出'}　·　${q.replayable?'可重玩':'不可重玩'}</p><p>${E(q.description)}</p><details><summary class="small">奖励标签与来源</summary><div class="mono small">${r.reward_tags.map(E).join('<br>')}</div>${sourceLink(q.source)}</details></div>`}).join('');
const other=i.quests.filter(q=>!specific.includes(q));if(other.length)text+=`<details><summary>${other.length} 条区域随机任务奖励关联</summary><p class="small">下列任务引用包含本装备的区域池，属于奖励候选关系。</p>${other.map(r=>`<p class="small">${E(Q.get(r.quest)?.name??r.quest)} · ${E(r.phase)}</p>`).join('')}</details>`;
text+='<details><summary>原始引用记录（合并前）</summary><p class="small">以下保留原始匹配证据，尚未应用全部继承、排除与稀有度规则。有效获取概率以计算器所选条件为准。</p>';if(i.sources.length)text+=tdTable(['来源','关联','保底／随机','随机触发率','原始池权重'],i.sources.map(r=>{const s=L.get(r.source_id);return [`<strong>${E(s?.name??r.source_id)}</strong><div class="small">${E(s?.kind)}</div>`,E(r.via),`${r.guaranteed} / ${r.rolls}`,r.rolls?`${(r.chance*100).toFixed(2)}%`:(r.guaranteed?'仅保底抽取':'仅提供候选池'),`${r.weight}<details><summary class="small">依据</summary>${sourceLink(s.source)}<div class="mono small">${r.matched.map(e=>`${E(e.target)} ${E(e.operation)} ${e.weight}`).join('<br>')}</div></details>`]}));else text+='<p class="small">获取方式未在已解析掉落 JSON 中定位。</p>';return text+'</details>';}
function detailRaw(i){return `<h3>物品定义</h3><p class="mono">${E(i.id)}</p>${sourceLink(i.source)}<h3>标签</h3><p>${i.traits.map(t=>`<span class="pill muted">${E(t.replace('SW.',''))}</span>`).join('')}</p><h3>原始数据关联</h3>${i.source_rows.map(sourceLink).join('<br>')}<details><summary>查看装备数值、能力及参数记录</summary><pre class="raw-code">${E(JSON.stringify(i.stats,null,2))}</pre></details><h3>数据界限</h3><p class="small">${E(D.meta.method_note)}</p><p class="small">${E(D.meta.level_note)}</p>`;}
function renderDetail(){const i=state.item;if(!i)return;$('#detail-content').innerHTML=`<div class="detail-hero">${img(i.icon,i.name)}<div><span class="eyebrow">${i.unique?'UNIQUE TREASURE':'EQUIPMENT RECORD'}</span><h2 id="detail-title">${E(i.name)}</h2><div class="detail-en">${E(i.name_en)}</div><p>${E(i.description)}</p><div><span class="pill ${i.unique?'gold':''}">${E(i.subtype)}</span>${i.unique?'<span class="pill gold">独特</span>':''}</div></div></div><nav class="detail-tabs" aria-label="详情视图">${[['effects','属性与词条'],['probability','逐级概率'],['sources','掉落与任务'],['raw','原始依据']].map(([id,t])=>`<button data-detail-tab="${id}" class="${state.detailTab===id?'active':''}">${t}</button>`).join('')}</nav><div class="detail-body">${({effects:detailEffects,probability:probabilityPanel,sources:detailSources,raw:detailRaw}[state.detailTab])(i)}</div>`;}
function openItem(id){const i=I.get(id.toLowerCase());if(!i)return;state.item=i;state.probItem=i.id;state.probRarity='';state.probExtra=false;state.detailTab='effects';renderDetail();if(!$('#detail').open)$('#detail').showModal();$('#detail').scrollTop=0;}
document.addEventListener('click',e=>{
 const c=e.target.closest('[data-category]'),v=e.target.closest('[data-view]'),i=e.target.closest('[data-item]'),p=e.target.closest('[data-page]'),dt=e.target.closest('[data-detail-tab]');
 const rm=e.target.closest('[data-reverse-mode]'),rf=e.target.closest('[data-reverse-family]'),rd=e.target.closest('[data-effect-dictionary]'),pf=e.target.closest('[data-probability-family]');
 if(c){state.category=c.dataset.category;state.view='items';state.page=1;render();}
 if(v){state.view=v.dataset.view;state.page=1;state.query='';$('#search').value='';render();}
 if(i){e.preventDefault();if(i.dataset.matchFamily)state.probFamily=i.dataset.matchFamily;openItem(i.dataset.item);}
 if(p&&!p.disabled){state.page=Number(p.dataset.page);render();$('.section-title').scrollIntoView({block:'start'});}
 if(dt){state.detailTab=dt.dataset.detailTab;renderDetail();}
 if(rm){state.reverseMode=rm.dataset.reverseMode;render();}
 if(rf){state.reverseScope='all';state.reverseEffect=rf.dataset.reverseFamily;state.reverseMode=rf.dataset.reverseKind||'fixed';state.view='reverse';state.query='';$('#search').value='';render();}
 if(rd){state.view='affixes';state.query=rd.dataset.effectDictionary;$('#search').value=state.query;state.page=1;render();}
 if(pf){state.probFamily=pf.dataset.probabilityFamily;state.detailTab='probability';renderDetail();$('#detail').scrollTop=0;}
});
$('#search').addEventListener('input',e=>{state.query=e.target.value;state.page=1;render();});$('#rarity').addEventListener('change',e=>{state.rarity=e.target.value;state.page=1;render();});$('#sort').addEventListener('change',e=>{state.sort=e.target.value;render();});$('#close-detail').addEventListener('click',()=>$('#detail').close());
$('#search-descriptions').addEventListener('change',e=>{state.searchDescriptions=e.target.checked;state.page=1;try{localStorage.setItem('gear-atlas.search-descriptions',String(state.searchDescriptions));}catch{}render();});
document.addEventListener('input',e=>{if(e.target.id==='curve-input'){state.curve=Number(e.target.value);$('#curve-output').textContent=state.curve;}});document.addEventListener('change',e=>{if(e.target.id==='detail-curve'){state.curve=Number(e.target.value);renderDetail();}if(e.target.id==='curve-input'){state.curve=Number(e.target.value);render();$('#curve-input').focus();}});
document.addEventListener('change',e=>{
 const id=e.target.id;
 if(id==='reverse-effect'){state.reverseEffect=e.target.value;render();return;}
 if(id==='reverse-scope'){state.reverseScope=e.target.value;render();return;}
 if(id==='prob-item'){state.probItem=e.target.value;state.probRarity='';state.probFamily='';}
 if(id==='prob-rarity')state.probRarity=e.target.value;
 if(id==='prob-family')state.probFamily=e.target.value;
 if(id==='prob-extra')state.probExtra=e.target.checked;
 if(['prob-item','prob-rarity','prob-family','prob-extra'].includes(id)){if($('#detail').open&&state.detailTab==='probability')renderDetail();else render();}
});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('#detail').open){e.preventDefault();$('#search').focus();}});
$('#detail').addEventListener('click',e=>{if(e.target===$('#detail')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right)e.target.close();}});
$('#detail').addEventListener('close',()=>{if(!$('#detail').open)$('#detail-content').replaceChildren();});
AtlasExplorers.connect({render,openItem,navigate:(view,query='')=>{state.view=view;state.query=query;state.page=1;$('#search').value=query;render();}});
render();
})();
