/* Local, offline map / quest / conditional drop explorers. */
(()=>{'use strict';
const D=window.ATLAS_DROPS,W=window.ATLAS_WORLD,C=window.ATLAS_DATA||window.ATLAS_CATALOG;
const $=s=>document.querySelector(s),E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s??'').toLocaleLowerCase().replace(/\s+/g,''),P=window.LootMath.percent;
const items=Object.values(D.items).filter(i=>i.shown),sources=new Map(D.sources.map(s=>[s.id,s])),maps=new Map(W.maps.map(m=>[m.id,m])),points=new Map(W.points.map(p=>[p.id,p])),quests=new Map(W.quests.map(q=>[q.id,q]));
const rarityNames={any:'所有允许稀有度','SW.Rarity.Common':'普通','SW.Rarity.Rare':'稀有','SW.Rarity.Special':'卓越','SW.Rarity.Unique':'独特','SW.Rarity.None':'无稀有度'};
const slotNames={'SW.LootSlot.Item':'装备','SW.LootSlot.SpecialGear':'指定奖励','SW.LootSlot.EnchantedBook':'附魔书','SW.LootSlot.Talismans':'护符','SW.LootSlot.Consumable':'消耗品','SW.LootSlot.Consumables':'消耗品','SW.LootSlot.Emeralds':'绿宝石','SW.LootSlot.TNT':'TNT'};
const colors={chest:'#edbd6b',entrance:'#bd9aed',travel:'#96dbea',npc:'#b9d48a',quest:'#e894ab',goal:'#e894ab',resource:'#66ba91',loot_spawn:'#edbd6b',mechanism:'#b3babc',combat:'#e88771',checkpoint:'#7d9bce'};
const placement={fixed:'固定摆放',random_candidate:'随机候选',generated_room:'房间生成后可用'};
let ui,query='',active='',scanToken=0;
const ds={item:items.find(i=>i.id==='SW.Item.MeleeWeapon.Sword_Unique1')?.id||items[0].id,source:'SW.LootActor.FancyChest',area:'SW.Area.Plains.A1',level:20,difficulty:'SW.Difficulty.Normal',rarity:'any',history:['','',''],bookHistory:['','','',''],owned:[],looting:0,extraRolls:1,dropIncrease:0,rarityBonus:0};
const ms={map:'SW.Region.Overworld',group:'world',pool:'all',kinds:new Set(['chest','entrance','travel','npc','quest','goal']),fixed:false,global:true,page:1,selected:'',quest:'',views:new Map()};
const qs={type:'all',incomplete:false};
let completed={};try{completed=JSON.parse(localStorage.getItem('gear-atlas.checklist')||'{}');}catch{}
const save=()=>{try{localStorage.setItem('gear-atlas.checklist',JSON.stringify(completed));}catch{}};
const opt=(v,name,current)=>`<option value="${E(v)}"${v===current?' selected':''}>${E(name)}</option>`;
const field=(id,label,body)=>`<label class="explorer-field" for="${id}"><span>${label}</span>${body}</label>`;
const select=(id,label,list,current)=>field(id,label,`<select id="${id}">${list.map(([v,n])=>opt(v,n,current)).join('')}</select>`);
const button=(text,attrs,cls='explorer-button')=>`<button class="${cls}" ${attrs}>${text}</button>`;
const table=(heads,rows)=>`<div class="table-wrap"><table><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
function groupedOptions(list,current,key='kind'){return [...new Set(list.map(i=>i[key]))].map(kind=>`<optgroup label="${E(kind)}">${list.filter(i=>i[key]===kind).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')).map(i=>opt(i.id,i.name,current)).join('')}</optgroup>`).join('');}
function chosenOptions(){return {...ds,owned:ds.owned,history:ds.history,bookHistory:ds.bookHistory};}
function formatSlot(s){return s.guaranteed||s.rolls?`保底 ${s.guaranteed} 次${s.rolls?` ＋ 随机 ${s.rolls} 次（每次 ${P(s.rollChance)}）`:''}`:'仅提供候选池';}
function relatedPointButton(source){const found=W.points.filter(p=>p.tag===source);return found.length?button(`地图位置 · ${found.length} 处 ↗`,`data-map-source="${E(source)}"`):'';}
function itemSourceSummary(item){
 const base=item.base_item||item.id,areas=D.areas.filter(a=>a.slots.some(s=>(window.LootMath.evaluateWeights(s.entries).get(base)||0)>0));
 const area=areas[0]?.id||'SW.Area.Plains.A1',chance=window.LootMath.calculate(item.id,{source:'SW.LootActor.FancyChest',area,level:20});
 return `<div class="notice gold">${areas.length?`示例：${E(D.areas.find(a=>a.id===area)?.name)} · 装备宝箱 · 威胁 20 · 普通难度：<strong>${P(chance.chance)}</strong>。`:'这件物品需按指定来源、任务或生成上下文查询。'} 基准为单人、空掉落历史、未填写已拥有物品和额外属性。<p>${button('查询完整条件掉落概率 ↗',`data-drop-item="${E(item.id)}"`)}</p></div>`;
}
function renderDrops(){
 $('#result-count').textContent=`371 个来源 · 137 个区域池`;
 const item=D.items[ds.item],source=sources.get(ds.source),result=window.LootMath.calculate(ds.item,chosenOptions());
 const groups=D.history_groups.filter(g=>items.some(i=>i.group===g.id)&&!g.id.includes('Cosmetic')&&!g.id.endsWith('Talisman'));
 return `<div class="notice">计算一次击败、开箱或领取指定批次奖励后，至少得到一件目标物品的概率。结果按所选来源、区域、威胁与历史记录计算；基准为单人。任务奖励的“首次完成”与普通领取分别列出。</div>
 <div class="drop-layout"><section class="panel drop-inputs"><h3>掉落条件</h3><div class="explorer-fields">
 ${field('drop-item','目标物品',`<select id="drop-item">${groupedOptions(items,ds.item,'category')}</select>`)}
 ${field('drop-source','击败／开箱／奖励来源',`<select id="drop-source">${groupedOptions(D.sources,ds.source)}</select>`)}
 ${select('drop-area','所在区域的物品池',D.areas.map(a=>[a.id,a.name]),ds.area)}
 ${select('drop-rarity','目标稀有度',Object.entries(rarityNames),ds.rarity)}
 ${select('drop-level','当前威胁等级',Array.from({length:20},(_,i)=>[String(i+1),'威胁 '+(i+1)]),String(ds.level))}
 ${select('drop-difficulty','难度',[['SW.Difficulty.Low','简单'],['SW.Difficulty.Normal','普通'],['SW.Difficulty.High','困难']],ds.difficulty)}
 </div><details class="advanced-drop"><summary>近期掉落、已拥有物品与额外属性</summary><p>装备按最近 3 次掉落的类别防重复。附魔书按最近 4 本排除；护符与附魔书还会检查已拥有物品。历史按从新到旧填写。</p><div class="explorer-fields compact-fields">
 ${ds.history.map((v,n)=>select('drop-history-'+n,`最近第 ${n+1} 件装备`,[['','未填记录'],...groups.map(g=>[g.id,g.name])],v)).join('')}
 ${ds.bookHistory.map((v,n)=>select('drop-book-'+n,`最近第 ${n+1} 本附魔书`,[['','未填记录'],...items.filter(i=>i.category==='附魔书').map(i=>[i.id,i.name])],v)).join('')}
 ${[['looting','成功随机掉落后的额外抽取概率',100,100],['extraRolls','每次最多额外抽取次数',20,1],['dropIncrease','随机触发率增加（百分点）',100,100],['rarityBonus','普通→稀有／稀有→卓越升级概率',100,100]].map(([key,label,max,scale])=>field('drop-'+key,label,`<input id="drop-${key}" type="number" min="0" max="${max}" step="${scale===1?1:0.1}" value="${Math.round(ds[key]*scale*1000)/1000}">`)).join('')}
 </div><fieldset class="owned-items"><legend>已拥有的附魔书／护符（${ds.owned.length}）</legend>${items.filter(i=>i.one_of_a_kind&&['附魔书','护符'].includes(i.category)).map(i=>`<label><input type="checkbox" data-owned="${E(i.id)}"${ds.owned.includes(i.id)?' checked':''}> ${E(i.name)}</label>`).join('')}</fieldset><p>复制已掉落物品会增加件数，不改变“至少得到一件”的概率。额外抽取使用原始池；不会更新近期掉落记录。联机人数修正不在本页结果内。</p></details></section>
 <section class="drop-result panel" aria-live="polite"><span class="eyebrow">AT LEAST ONE DROP</span><div class="drop-target">${item.icon?`<img src="${E(item.icon)}" alt="">`:''}<div><h3>${E(item.name)}</h3><span>${E(source.name)}</span></div></div><strong class="drop-big" id="drop-result">${P(result.chance)}</strong><p>一次来源触发 · 至少一件<br>${E(D.areas.find(a=>a.id===ds.area)?.name)} · 威胁 ${ds.level} · ${E(rarityNames[ds.rarity])}</p>${result.chance===0?'<div class="notice">当前条件下无法得到目标：检查候选池、所选稀有度、近期记录及已拥有物品。这里的 0% 是计算结果。</div>':''}
 <div class="drop-actions">${button('查看物品档案 ↗',`data-item="${E(item.id)}"`)}${relatedPointButton(ds.source)}${source.quest?button('查看任务 ↗',`data-open-quest="${E(source.quest)}"`):''}</div><p class="small">来源与区域必须是游戏中实际发生的组合。区域选择提供池上下文，不表示所选敌人一定在该区域出现。</p></section></div>
 <section class="panel"><h3>每个掉落槽如何得到这个结果</h3>${table(['掉落槽','触发次数','首次有效候选','首次抽到目标','该槽至少一件'],result.slots.map(s=>[E(slotNames[s.id]||s.id.replace('SW.LootSlot.','')),formatSlot(s),`${s.eligibleSize} / ${s.poolSize}`,P(s.firstChance),`<strong class="prob-value">${P(s.chance)}</strong>`]))}<p>最终结果合并所有有效掉落槽，计入多次抽取、历史排除、稀有度与独特替换。保底一次保证抽一次池，不保证是当前目标。</p>
 ${result.slots.filter(s=>s.pool.length).map(s=>`<details><summary>${E(slotNames[s.id]||s.id)} · 查看首次抽取候选与权重</summary>${table(['候选物品','合并权重','首次抽取占比','生成目标比例'],s.pool.map(p=>[E(p.name),Number(p.weight.toPrecision(7)),P(p.selection),P(p.targetFraction)]))}</details>`).join('')}</section>
 <section class="panel"><h3>继续寻找可掉落的组合</h3><p>沿用上方威胁、难度、历史与属性，仅显示概率大于 0 的组合。</p><div class="drop-actions">${button('查询当前区域的全部来源','data-drop-scan="sources"')}${button('查询该来源的全部区域','data-drop-scan="areas"')}</div><div id="drop-matches" aria-live="polite"></div></section>
 <details class="calculation-details"><summary>概率依据与适用范围</summary>${Object.values(D.models_method).map(t=>`<p>${E(t)}</p>`).join('')}<p>使用本机客户端两套一致的已加载掉落表。默认不读取你的存档；未填写历史表示从空记录起算。某些来源由事件或任务脚本额外注入标签，选取对应奖励批次后再查询。快照以外的在线变更、联机动态缩放和未提取的脚本条件仍需单独确认。</p><a href="data/raw/runtime_loot_tables.json" class="source-link">原始掉落快照 ↗</a></details>`;
}
function pointsForMap(){return W.points.filter(p=>(query&&ms.global||p.map===ms.map)&&ms.kinds.has(p.kind)&&(!ms.fixed||p.placement==='fixed')&&(!ms.quest||p.quest_ids?.includes(ms.quest))&&(!query||norm([p.name,p.tag,p.actor,p.area_name,maps.get(p.map)?.name,...(p.quest_ids||[]).map(id=>quests.get(id)?.name)].join(' ')).includes(norm(query))));}
function mapSelector(){const list=W.maps.filter(m=>m.kind===ms.group&&(ms.group!=='room'||ms.pool==='all'||m.pool===ms.pool));return `<div class="map-selectors">${select('map-group','地图类型',[['world','大地图'],['indoor','室内区域'],['room','随机地牢房间模板']],ms.group)}${ms.group==='room'?select('map-pool','房间库',[['all','全部房间库'],...[...new Set(W.maps.filter(m=>m.kind==='room').map(m=>m.pool).filter(Boolean))].sort().map(p=>[p,p])],ms.pool):''}${select('map-id','当前地图',list.map(m=>[m.id,`${m.name}${m.schematic?' · 点位示意':''}（${m.point_count}）`]),ms.map)}</div>`;}
function renderWorld(q=''){
 query=q;const m=maps.get(ms.map),visible=pointsForMap();ms.page=Math.min(ms.page,Math.max(1,Math.ceil(visible.length/60)));$('#result-count').textContent=`${visible.length} 个匹配点 · 总计 ${W.points.length.toLocaleString()}`;
 return `<div class="notice map-notice">固定摆放表示资源中位置固定，仍可能受任务或机关控制。紫色空心入口为随机候选；房间图只适用于该模板被选中的情况。已扫描 ${W.coverage.map_packages_scanned.toLocaleString()} 个地图包，覆盖 44 条任务记录。</div>${mapSelector()}
 <div class="map-filters">${Object.entries(W.kind_names).map(([k,name])=>`<label><input type="checkbox" data-map-kind="${k}"${ms.kinds.has(k)?' checked':''}><span class="legend-dot" style="--point:${colors[k]}"></span>${E(name)}</label>`).join('')}<label><input type="checkbox" id="map-fixed"${ms.fixed?' checked':''}>只看固定摆放</label><label><input type="checkbox" id="map-global"${ms.global?' checked':''}>搜索全部地图</label></div>
 ${ms.quest?`<div class="notice">正在显示任务：${E(quests.get(ms.quest)?.name)} ${button('清除任务筛选','data-map-clear-quest','text-action')}</div>`:''}
 <div class="map-workspace"><section class="map-canvas-panel"><div class="map-heading"><div><strong>${E(m.name)}</strong><span>${m.kind==='room'?'房间局部坐标 · 布局随生成组合':m.kind==='world'?'游戏原始高清地图':'游戏原始室内地形图'}</span></div><div class="map-tools">${button('＋','data-map-zoom="in" aria-label="放大地图"')}${button('−','data-map-zoom="out" aria-label="缩小地图"')}${button('全图','data-map-zoom="reset" aria-label="显示完整地图"')}</div></div><div class="map-canvas" id="map-canvas">${mapSVG(m,visible.filter(p=>p.map===m.id))}</div><div class="map-caption">拖动平移 · 滚轮或按钮缩放 · 点击点位查看详情${m.schematic?' · 此模板没有原始底图，仅显示点位示意':''}</div></section>
 <aside class="map-side"><div id="map-inspector">${pointDetails(points.get(ms.selected))}</div><details open class="map-list-panel"><summary>点位清单 · ${visible.length} 个</summary><div class="map-point-list">${visible.slice((ms.page-1)*60,ms.page*60).map(p=>`<button class="map-point-row${p.id===ms.selected?' selected':''}" data-map-point="${p.id}"><span class="legend-dot" style="--point:${colors[p.kind]}"></span><span><strong>${E(p.name)}</strong><small>${E(p.area_name||maps.get(p.map)?.name)} · ${placement[p.placement]}</small></span><span>↗</span></button>`).join('')||'<p class="small">没有匹配点位。可调整类型或地图筛选。</p>'}</div><div class="map-pagination">${button('上一页',`data-map-page="${ms.page-1}"${ms.page===1?' disabled':''}`)}<span>${ms.page} / ${Math.max(1,Math.ceil(visible.length/60))}</span>${button('下一页',`data-map-page="${ms.page+1}"${ms.page*60>=visible.length?' disabled':''}`)}</div></details></aside></div>
 <details class="calculation-details"><summary>完整性、固定内容与随机地牢</summary>${W.notes.map(t=>`<p>${E(t)}</p>`).join('')}<p>包含 3 张大地图、23 张室内地图及 846 个房间／连接模板。184 个房间模板有原始地形图，其余保留带坐标的点位示意。模板文件中可能有测试或未启用资源；未把资源存在当作流程可达的证明。</p><p><a href="data/world.json" class="source-link">全部地图、点位、任务与原始路径 ↗</a></p></details>`;
}
function mapSVG(m,visible){
 const v=ms.views.get(m.id)||defaultView(m),r=m.width/150;
 // The minimap R channel encodes terrain/void. G contains terrain elevation.
 const filters=`<defs><filter id="terrain-mask" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="discrete" tableValues="1 1 1 0"/></feComponentTransfer><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1 0 0 0 0"/></filter><filter id="terrain-gray" color-interpolation-filters="sRGB"><feColorMatrix values="0 .46 0 0 .24  0 .5 0 0 .31  0 .38 0 0 .24  0 0 0 1 0"/></filter><pattern id="map-grid" width="${m.width/16}" height="${m.height/16}" patternUnits="userSpaceOnUse"><path d="M ${m.width/16} 0 H 0 V ${m.height/16}" fill="none" stroke="#a0bf8018" stroke-width="${m.width/1200}"/></pattern>${m.mask?`<mask id="land" maskUnits="userSpaceOnUse" x="0" y="0" width="${m.width}" height="${m.height}" style="mask-type:alpha"><image href="${E(m.mask)}" x="0" y="${m.kind==='world'?m.height-m.mask_height:0}" width="${m.mask_width}" height="${m.mask_height}" filter="url(#terrain-mask)"/></mask>`:''}</defs>`;
 const terrain=m.tiles?.length?`<g${m.mask?' mask="url(#land)"':''}>${m.tiles.map(t=>`<image href="${E(t.src)}" x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}"/>`).join('')}</g>`:m.mask?`<image href="${E(m.mask)}" width="${m.mask_width}" height="${m.mask_height}" filter="url(#terrain-gray)" mask="url(#land)"/>`:'';
 return `<svg id="world-svg" viewBox="${v.join(' ')}" role="img" aria-label="${E(m.name)}交互地图；可使用右侧点位清单定位" tabindex="0">${filters}<rect x="-10000" y="-10000" width="20000" height="20000" fill="#101915"/>${terrain}<rect width="${m.width}" height="${m.height}" fill="url(#map-grid)"/><g id="map-markers">${visible.map(p=>`<g transform="translate(${p.pixel.join(' ')})" class="map-marker${p.id===ms.selected?' selected':''}" data-map-point="${p.id}" role="button" tabindex="0" aria-label="${E(p.name+' · '+placement[p.placement])}"><title>${E(p.name+' · '+(p.area_name||m.name)+' · '+placement[p.placement])}</title><circle r="${r}" fill="${p.placement==='random_candidate'?'#17201f':colors[p.kind]}" stroke="${colors[p.kind]}" stroke-width="${r*.32}"/><text text-anchor="middle" dy=".34em" font-size="${r*1.35}" fill="${p.placement==='random_candidate'?colors[p.kind]:'#172019'}">${{chest:'■',entrance:'◇',travel:'＋',npc:'●',quest:'!',goal:'!',resource:'·',loot_spawn:'?',mechanism:'×',combat:'×',checkpoint:'+'}[p.kind]}</text></g>`).join('')}</g></svg>`;
}
function pointDetails(p){
 if(!p)return `<div class="point-inspector"><span class="eyebrow">EXPLORE THE WORLD</span><h3>选择一个点位</h3><p>查看精确坐标、生成条件、关联任务和掉落计算。也可以搜索物品名，如“萤石瓶”。</p></div>`;
 const rules=(p.entrance_rules||[]).map(id=>W.procedural_areas.find(r=>r.id===id)).filter(Boolean),source=sources.get(p.tag);
 return `<section class="point-inspector"><span class="pill" style="color:${colors[p.kind]}">${E(W.kind_names[p.kind])}</span><h3>${E(p.name)}</h3><p>${E(p.area_name||maps.get(p.map)?.name)} · ${placement[p.placement]}</p><p class="point-coordinate">${maps.get(p.map)?.kind==='room'?'房间局部':'世界'}坐标：${p.position.map(n=>Number(n.toFixed(1))).join(' / ')}</p>${p.conditions?.length?`<p>${p.conditions.map(E).join('；')}</p>`:''}
 ${rules.map(r=>`<div class="entrance-rule"><strong>${r.minimum===r.maximum?`选出 ${r.minimum} 处`:`选出 ${r.minimum}–${r.maximum} 处`} / ${r.doors.length} 个候选</strong><p>${r.destinations.filter(d=>d.enabled).map(d=>E(d.name)).join('、')}</p><small>同组候选共享生成数量；当前位置并非每局开放。</small></div>`).join('')}
 ${source?`<p>${button('查询此处掉落概率 ↗',`data-drop-source="${E(source.id)}" data-point-area="${E(p.area||'')}"`)}</p>`:''}
 ${(p.quest_ids||[]).length?`<div class="point-quests">${p.quest_ids.map(id=>button(E(quests.get(id)?.name||id),`data-open-quest="${E(id)}"`,'text-action')).join('')}</div>`:''}
 <label class="checkline"><input type="checkbox" data-complete="point:${p.id}"${completed['point:'+p.id]?' checked':''}> 已探索此点</label><details><summary>坐标与原始依据</summary><p>坐标单位为游戏内部单位（100 单位约一格）；房间局部坐标不等于它在当前世界中的位置。</p><p class="mono">${E(p.tag)}<br>${E(p.source)}</p></details></section>`;
}
function questMatches(q){return (qs.type==='all'||qs.type==='side'&&q.type==='SideQuest'||qs.type==='main'&&q.type==='CoreQuest'||qs.type==='boss'&&q.repeat_boss)&&(!qs.incomplete||!completed['quest:'+q.id])&&(!query||norm([q.name,q.id,q.description,q.area_name,...q.goals.map(g=>g.text)].join(' ')).includes(norm(query)));}
function renderQuests(q=''){
 query=q;const list=W.quests.filter(questMatches),done=W.quests.filter(q=>completed['quest:'+q.id]).length;$('#result-count').textContent=`${list.length} 条记录 · 已完成 ${done} / 44`;
 return `<div class="quest-overview"><div><span class="eyebrow">YOUR ADVENTURE LOG</span><h3>把下一段冒险，留在清单里。</h3><p>15 条主线 · 29 条支线记录（含 8 条首领重战）。勾选进度保存在当前浏览器，独立于游戏存档。</p></div><strong>${done}<span>/ 44</span></strong></div>
 <div class="quest-controls"><div class="segmented">${[['all','全部'],['side','支线'],['main','主线'],['boss','首领重战']].map(([id,name])=>button(name,`data-quest-type="${id}"`,id===qs.type?'active':'')).join('')}</div><label class="checkline"><input id="quest-incomplete" type="checkbox"${qs.incomplete?' checked':''}>只看未完成</label>${button('导出清单进度','data-checklist-export')}</div>
 <div class="quest-cards">${list.map(q=>{const rewardSources=D.sources.filter(s=>s.quest===q.id),checked=!!completed['quest:'+q.id];return `<article class="quest-card${checked?' completed':''}" id="quest-${E(q.id)}"><header><label class="quest-title"><input type="checkbox" data-complete="quest:${E(q.id)}"${checked?' checked':''}><h3>${E(q.name)}</h3></label><span class="pill">${q.type==='CoreQuest'?'主线':q.repeat_boss?'首领重战':'支线'}</span></header><div class="quest-meta">${E(q.area_name||'任务场景')} · ${q.replayable?'可重玩':'单次任务'}${q.initial_state==='Unavailable'?' · 初始不可用':''}</div><p class="quest-description">${E(q.description||'源文件未提供任务介绍。')}</p>
 <p class="quest-prerequisites">前置：${q.prerequisites.length?q.prerequisites.map(id=>E(quests.get(id)?.name||id)).join('、'):'未设置前置任务'}</p>
 <div class="quest-card-actions">${q.map_points.length?button(`地图目标 · ${q.map_points.length} 处 ↗`,`data-quest-map="${E(q.id)}"`):'<span class="small">未定位到可核实的固定坐标</span>'}<span class="small mono">${E(q.id)}</span></div>
 <details class="quest-steps"><summary>目标清单 · ${q.goals.length} 项</summary>${q.goals.map((g,n)=>`<label class="goal-check"><input type="checkbox" data-complete="goal:${E(q.id+':'+g.id)}"${completed['goal:'+q.id+':'+g.id]?' checked':''}><span><b>${String(n+1).padStart(2,'0')}</b>${E(g.text)}${g.count?` <small>× ${g.count}</small>`:''}</span></label>`).join('')||'<p class="small">没有单独显示的叶级目标。</p>'}</details>
 ${rewardSources.length?`<details class="quest-rewards"><summary>奖励批次与掉落概率 · ${rewardSources.length}</summary>${rewardSources.map(s=>`<p>${button(E(s.name.replace(q.name+' · ',''))+' ↗',`data-drop-source="${E(s.id)}"`,'text-action')}</p>`).join('')}<p class="small">每个批次单独计算；首次奖励不会在每次重玩时自动重复。</p></details>`:''}<details class="quest-source"><summary>记录状态与出处</summary><p class="small">初始状态：${E(q.initial_state)}。任务图含 ${q.goal_nodes} 个控制／目标节点，这里列出有玩家显示文本的叶级目标；分支可能由任务状态选择。${q.missing_localized_name?'这条记录缺少中文标题，保留源 ID，不推定已开放。':''}</p><a class="source-link" href="data/raw/${E(q.source.split('#')[0])}">${E(q.source)}</a></details></article>`;}).join('')||'<div class="empty">没有符合筛选条件的任务。</div>'}</div>`;
}
function defaultView(m){if(m.kind!=='world')return [0,0,m.width,m.height];const width=m.bounds.MaxPos.Y-m.bounds.MinPos.Y,height=m.bounds.MaxPos.X-m.bounds.MinPos.X;return [-10,m.height-height-10,width+20,height+20];}
function setMap(id){const m=maps.get(id);if(!m)return;ms.map=id;ms.group=m.kind;ms.pool='all';ms.page=1;}
function focusPoint(id){const p=points.get(id);if(!p)return;setMap(p.map);ms.selected=id;ms.kinds.add(p.kind);const m=maps.get(p.map),size=m.width*.17;if(m.kind==='room')ms.views.set(p.map,defaultView(m));else ms.views.set(p.map,[p.pixel[0]-size/2,p.pixel[1]-size/2,size,size*m.height/m.width]);ui.navigate('world',query);}
function openDrop(item,source,area){if(item){const known=items.find(i=>i.id.toLowerCase()===item.toLowerCase());if(known)ds.item=known.id;}if(source&&sources.has(source)){ds.source=source;const s=sources.get(source);if(s.default_area&&D.areas.some(a=>a.id===s.default_area))ds.area=s.default_area;if(!item){const candidates=s.slots.flatMap(sl=>sl.entries).filter(e=>e.operation==='Set'&&e.weight>0&&D.items[e.target]?.shown);if(candidates.length)ds.item=candidates[0].target;}}if(area&&D.areas.some(a=>a.id===area))ds.area=area;$('#detail')?.close();ui.navigate('drops');}
function mount(view){active=view;scanToken++;if(view==='world')mountMap();}
function mountMap(){
 const svg=$('#world-svg');if(!svg)return;let drag=null,moved=false;
 const get=()=>Array.from(svg.viewBox.baseVal?[svg.viewBox.baseVal.x,svg.viewBox.baseVal.y,svg.viewBox.baseVal.width,svg.viewBox.baseVal.height]:[]);
 const put=v=>{svg.setAttribute('viewBox',v.join(' '));ms.views.set(ms.map,v);const r=v[2]/Math.max(svg.clientWidth,200)*6;svg.querySelectorAll('.map-marker circle').forEach(c=>{c.setAttribute('r',r);c.setAttribute('stroke-width',r*.32);});svg.querySelectorAll('.map-marker text').forEach(c=>c.setAttribute('font-size',r*1.35));};
 const position=e=>new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());
 const zoom=(scale,anchor)=>{let v=get(),m=maps.get(ms.map),width=Math.min(m.width*1.5,Math.max(m.width/50,v[2]*scale));scale=width/v[2];const a=anchor||{x:v[0]+v[2]/2,y:v[1]+v[3]/2};put([a.x-(a.x-v[0])*scale,a.y-(a.y-v[1])*scale,width,v[3]*scale]);};
 svg.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?1.15:1/1.15,position(e));},{passive:false});
 svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,point:position(e),view:get()};moved=false;if(!e.target.closest('[data-map-point]'))svg.setPointerCapture(e.pointerId);});
 svg.addEventListener('pointermove',e=>{if(!drag)return;const p=position(e);if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>4)moved=true;if(moved){const v=get();put([v[0]+drag.point.x-p.x,v[1]+drag.point.y-p.y,v[2],v[3]]);}});
 svg.addEventListener('pointerup',()=>{drag=null;});svg.addEventListener('pointercancel',()=>{drag=null;});
 svg.addEventListener('click',e=>{if(moved){e.stopImmediatePropagation();moved=false;}},true);
 svg.addEventListener('keydown',e=>{if(e.key==='+'||e.key==='='){e.preventDefault();zoom(.8);}if(e.key==='-'){e.preventDefault();zoom(1.25);}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();let v=get();v[0]+=({'ArrowLeft':-1,'ArrowRight':1}[e.key]||0)*v[2]*.1;v[1]+=({'ArrowUp':-1,'ArrowDown':1}[e.key]||0)*v[3]*.1;put(v);}});
 document.querySelectorAll('[data-map-zoom]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.mapZoom==='reset'){put(defaultView(maps.get(ms.map)));}else zoom(b.dataset.mapZoom==='in'?.7:1/.7);}));put(get());
}
async function scanDrops(kind){const target=$('#drop-matches'),token=++scanToken,list=kind==='sources'?D.sources:D.areas,found=[];target.innerHTML='<p>正在计算全部候选…</p>';const options=chosenOptions();for(let n=0;n<list.length;n++){const entry=list[n],overrides=kind==='sources'?{source:entry.id}:{area:entry.id};const result=window.LootMath.calculate(ds.item,{...options,...overrides});if(result.chance>0)found.push({entry,chance:result.chance});if(n%12===0){await new Promise(r=>setTimeout(r,0));if(token!==scanToken)return;}}found.sort((a,b)=>b.chance-a.chance);target.innerHTML=found.length?`<p>${found.length} 个正概率组合；任务批次仍需满足领取条件。</p>${table([kind==='sources'?'来源':'区域','至少获得一件','选择'],found.map(({entry,chance})=>[E(entry.name),P(chance),button('采用此组合',`data-drop-match-${kind}="${E(entry.id)}"`,'text-action')]))}`:'<p>当前条件下没有正概率组合。可检查历史、已有物品及难度。</p>';}
document.addEventListener('change',e=>{const t=e.target,id=t.id;
 if(t.dataset.complete){completed[t.dataset.complete]=t.checked;save();if(t.dataset.complete.startsWith('quest:')){t.closest('.quest-card')?.classList.toggle('completed',t.checked);const count=W.quests.filter(q=>completed['quest:'+q.id]).length;$('.quest-overview>strong').innerHTML=`${count}<span>/ 44</span>`;$('#result-count').textContent=`${W.quests.filter(questMatches).length} 条记录 · 已完成 ${count} / 44`;if(qs.incomplete)ui.render();}return;}
 if(t.dataset.owned){ds.owned=t.checked?[...new Set([...ds.owned,t.dataset.owned])]:ds.owned.filter(v=>v!==t.dataset.owned);const scroll=$('.owned-items').scrollTop;ui.render();$('.advanced-drop').open=true;$('.owned-items').scrollTop=scroll;return;}
 if(id.startsWith('drop-history-'))ds.history[Number(id.at(-1))]=t.value;else if(id.startsWith('drop-book-'))ds.bookHistory[Number(id.at(-1))]=t.value;
 else if(['drop-item','drop-source','drop-area','drop-rarity','drop-difficulty'].includes(id)){ds[id.slice(5)]=t.value;if(id==='drop-source'){const s=sources.get(t.value);if(s.default_area&&D.areas.some(a=>a.id===s.default_area))ds.area=s.default_area;}}
 else if(id==='drop-level')ds.level=Number(t.value);
 else if(['drop-looting','drop-extraRolls','drop-dropIncrease','drop-rarityBonus'].includes(id)){const key=id.slice(5),scale=key==='extraRolls'?1:100;ds[key]=Math.max(0,Math.min(key==='extraRolls'?20:1,Number(t.value)/scale||0));}
 else if(t.dataset.mapKind){if(t.checked)ms.kinds.add(t.dataset.mapKind);else ms.kinds.delete(t.dataset.mapKind);ms.page=1;}
 else if(id==='map-group'){const first=W.maps.find(m=>m.kind===t.value);setMap(first.id);ms.selected='';}
 else if(id==='map-pool'){ms.pool=t.value;const first=W.maps.find(m=>m.kind==='room'&&(t.value==='all'||m.pool===t.value));ms.map=first.id;ms.selected='';ms.page=1;}
 else if(id==='map-id'){ms.map=t.value;ms.selected='';ms.page=1;}
 else if(id==='map-fixed')ms.fixed=t.checked;
 else if(id==='map-global')ms.global=t.checked;
 else if(id==='quest-incomplete')qs.incomplete=t.checked;else return;
 const advanced=$('.advanced-drop')?.open;ui.render();if(advanced&&$('.advanced-drop'))$('.advanced-drop').open=true;
});
document.addEventListener('click',e=>{const b=e.target.closest('button,a');if(!b)return;
 if(b.dataset.dropItem){e.preventDefault();openDrop(b.dataset.dropItem);}
 if(b.dataset.dropSource){e.preventDefault();openDrop(null,b.dataset.dropSource,b.dataset.pointArea);}
 if(b.dataset.dropScan)scanDrops(b.dataset.dropScan);
 if(b.dataset.dropMatchSources){ds.source=b.dataset.dropMatchSources;ui.render();}
 if(b.dataset.dropMatchAreas){ds.area=b.dataset.dropMatchAreas;ui.render();}
 if(b.dataset.mapSource){const match=W.points.find(p=>p.tag===b.dataset.mapSource);ms.quest='';ms.fixed=false;query=match?.name||'';if(match)focusPoint(match.id);}
 if(b.dataset.mapPoint)focusPoint(b.dataset.mapPoint);
 if(b.dataset.mapPage){ms.page=Number(b.dataset.mapPage);ui.render();}
 if(b.hasAttribute('data-map-clear-quest')){ms.quest='';ui.render();}
 if(b.dataset.questType){qs.type=b.dataset.questType;ui.render();}
 if(b.dataset.openQuest){qs.type='all';qs.incomplete=false;ui.navigate('quests',quests.get(b.dataset.openQuest)?.id||b.dataset.openQuest);}
 if(b.dataset.questMap){const q=quests.get(b.dataset.questMap);ms.quest=q.id;ms.fixed=false;ms.global=true;ms.kinds=new Set(Object.keys(W.kind_names));query='';const p=points.get(q.map_points[0]);if(p){setMap(p.map);ms.selected=p.id;ms.views.delete(p.map);ui.navigate('world');}}
 if(b.hasAttribute('data-checklist-export')){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify({version:W.version,exported:new Date().toISOString(),completed},null,2)],{type:'application/json'}));a.href=url;a.download='Minecraft_Dungeons_II_探索进度.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
});
document.addEventListener('click',e=>{const p=e.target.closest('g[data-map-point]');if(p)focusPoint(p.dataset.mapPoint);});
document.addEventListener('keydown',e=>{const p=e.target.closest('g[data-map-point]');if(p&&(e.key==='Enter'||e.key===' ')){e.preventDefault();focusPoint(p.dataset.mapPoint);}});
window.AtlasExplorers={connect:api=>{ui=api;},renderDrops,renderWorld,renderQuests,mount,openDrop,itemSourceSummary};
})();
