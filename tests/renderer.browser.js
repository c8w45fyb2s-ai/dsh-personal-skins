import {installRenderer} from '../src/client/renderer.js';

const results=document.querySelector('#results');
const failures=[];
let skips=0;
function assert(condition,message){
  const item=document.createElement('li');
  item.textContent=`${condition?'PASS':'FAIL'} · ${message}`;
  item.style.color=condition?'#28784c':'#a12638';
  results.append(item);
  if(!condition)failures.push(message);
}
const supportsAppRegion=CSS.supports('-webkit-app-region','drag')&&CSS.supports('-webkit-app-region','initial');
function assertAppRegion(condition,message){
  if(!supportsAppRegion){
    const item=document.createElement('li');
    item.textContent=`SKIP · ${message} (browser does not support -webkit-app-region)`;
    results.append(item);
    skips++;
    return;
  }
  assert(condition,message);
}
const appRegion=element=>getComputedStyle(element).getPropertyValue('-webkit-app-region').trim();
const cssRgb=hex=>`rgb(${hex.slice(1).match(/../g).map(part=>parseInt(part,16)).join(', ')})`;
const tick=()=>new Promise(resolve=>setTimeout(resolve,80));
const html=document.documentElement;
const viewArea=document.querySelector('.view-area');
const baseSurfaces=[document.body,document.querySelector('.app-frame'),document.querySelector('.center-column'),document.querySelector('[data-slot="main"]'),viewArea];
const panelSurfaces=[document.querySelector('.panel-one'),document.querySelector('.panel-two'),document.querySelector('[data-composer-card]')];
const composer=document.querySelector('[data-composer-card]');
const sidebar=document.querySelector('.sidebar');
const header=document.querySelector('.ST7X_W_header');
const sidebarColumn=document.querySelector('.sidebar-col');
const message=document.querySelector('[data-chat-flow-key]');
const assistantRoot=document.querySelector('.gKv1-q_root');
const turnTail=document.querySelector('[data-turn-tail]');
const tailPills=[...turnTail.querySelectorAll('.ppByMG_action,.ppByMG_timeStart,.ppByMG_endInfo')];
const statsPill=document.querySelector('[data-composer-stats] .OpZ85W_pill');
const contextTrigger=document.querySelector('.y0jqnG_trigger');
const messageInput=document.querySelector('input[aria-label="Message input"]');
const originalSurface=`--dsw-alias-bg-base`;
const originalSurfaceValue=getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim();
const whitePixel='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="8" height="8"%3E%3Crect width="8" height="8" fill="%23e9c6ce"/%3E%3C/svg%3E';
const active={
  id:'fixture',name:'Fixture',
  light:{backgroundId:'bg',characterId:null},
  dark:{backgroundId:null,characterId:null},
  settings:{accent:'#D88F9E',backgroundX:50,backgroundY:50,backgroundScale:125,blur:2,overlay:.3,panelOpacity:.7,characterSide:'right',characterSize:35,characterOpacity:1,characterMirror:false},
};
const api={state:async()=>({schemaVersion:1,activePresetId:'fixture',presets:[active]}),assetUrl:async id=>id==='bg'?whitePixel:''};
const renderer=installRenderer({api});

await tick();
const layer=document.querySelector('.dsh-skin-layer');
assert(html.hasAttribute('data-dsh-skin-surface'),'active preset marks the surface on the document element');
assert(html.getAttribute('data-dsh-skin-readable')==='light','active light skin enables the shared readability mode');
assert(baseSurfaces.every(element=>getComputedStyle(element).getPropertyValue('--dsw-alias-bg-base').trim()==='transparent'&&getComputedStyle(element).backgroundColor==='rgba(0, 0, 0, 0)'),'nested Darwin base surfaces paint transparent so the wallpaper shows through');
const tint=layer.querySelector('.dsh-skin-surface');
assert(Boolean(tint)&&getComputedStyle(tint).backgroundColor==='rgba(255, 255, 255, 0.12)','panel opacity tints the wallpaper exactly once');
assert(panelSurfaces.every((element,index)=>getComputedStyle(element).backgroundColor===(index===2?'rgba(255, 255, 255, 0.92)':'rgba(253, 251, 251, 0.82)')),'local refined panels stay accent-tinted while the composer gets its light readability surface');
assert(!document.querySelector('[data-dsh-skin-box="root"]'),'a display:contents slot anchor is never restyled');
assert(layer?.parentElement===document.body,'decorative layer lives outside the host tree');
assert(layer?.style.visibility==='visible'&&layer.querySelector('.dsh-skin-image').getAttribute('src')===whitePixel,'asset background renders in its own image layer');
assert(Boolean(tint)&&tint.previousElementSibling?.classList.contains('dsh-skin-character')&&tint.previousElementSibling.previousElementSibling?.classList.contains('dsh-skin-shade'),'refined character paints above the tint while basic keeps original DOM order');
assert(getComputedStyle(layer).zIndex==='-1','decoration sits behind content');
assertAppRegion(appRegion(layer)==='none','full-window decoration resets the host direct-child no-drag rule to the app-region default');
assertAppRegion(appRegion(document.querySelector('[data-window-drag]'))==='drag','host titlebar drag region remains draggable');
assertAppRegion(appRegion(document.querySelector('.topbar button'))==='no-drag','interactive controls remain non-draggable');
assert(composer.getAttribute('data-dsh-skin-box')==='composer','actual composer card is marked for accent and panel styling');
assert(sidebar.getAttribute('data-dsh-skin-box')==='sidebar','actual sidebar box is marked');
assert(message.getAttribute('data-dsh-skin-box')==='message','supported message row is marked');
assert(header.getAttribute('data-dsh-skin-box')==='header','the real painted conversation header is marked as one box');
assert(getComputedStyle(header).backgroundColor==='rgba(255, 255, 255, 0.94)','refined mode gives the full header one solid translucent skin fill');
assert(getComputedStyle(header.querySelector('.ST7X_W_crumbCurrent')).color===cssRgb(getComputedStyle(html).getPropertyValue('--dsh-skin-header-ink').trim()),'current conversation title uses the local readable header ink');
assert(getComputedStyle(header.querySelector('.ST7X_W_tab')).color===cssRgb(getComputedStyle(html).getPropertyValue('--dsh-skin-page-caption').trim()),'inactive conversation tab uses the shared readable caption label');
assert(getComputedStyle(header.querySelector('.ST7X_W_tabActive')).color===cssRgb(getComputedStyle(html).getPropertyValue('--dsh-skin-header-accent').trim()),'active conversation tab uses its contrast-checked header accent');
assert(getComputedStyle(header).backgroundColor==='rgba(255, 255, 255, 0.94)','light conversation header uses the shared translucent light surface');
assert(getComputedStyle(header.querySelector('.ST7X_W_crumbCurrent')).color==='rgb(41, 39, 42)','header primary text uses the deep readable ink');
assert(getComputedStyle(document.querySelector('.fixture-primary')).color==='rgb(41, 39, 42)'&&getComputedStyle(document.querySelector('.fixture-secondary')).color==='rgb(83, 80, 88)'&&getComputedStyle(document.querySelector('.fixture-tertiary')).color==='rgb(83, 91, 102)','main content projects distinct primary, secondary, and tertiary readable text');
assert(getComputedStyle(sidebar).backgroundColor==='rgba(255, 255, 255, 0.9)'&&getComputedStyle(sidebarColumn).backgroundColor==='rgba(0, 0, 0, 0)','light sidebar paints one readable surface without stacking another one');
assert(getComputedStyle(sidebar.querySelector('._3WPZCG_panelRow')).color==='rgb(41, 39, 42)','sidebar rows use the deep readable ink');
assert(getComputedStyle(sidebar.querySelector('.jJkEga_time')).color==='rgb(83, 91, 102)'&&getComputedStyle(sidebar.querySelector('.jJkEga_projectText')).color==='rgb(83, 91, 102)','sidebar timestamps and project metadata use caption text');
assert(getComputedStyle(sidebar.querySelector('.jJkEga_slot:not(.jJkEga_folderActive)')).color==='rgb(83, 80, 88)','inactive sidebar icon uses the dedicated icon ink');
assert(getComputedStyle(sidebar.querySelector('.jJkEga_folderActive')).color==='rgb(24, 113, 184)','active folder icon retains the host business accent');
assert(getComputedStyle(assistantRoot).backgroundColor==='rgba(255, 255, 255, 0.92)'&&getComputedStyle(assistantRoot).color==='rgb(41, 39, 42)','assistant response gets a light content surface and deep text');
assert(tailPills.every(el=>getComputedStyle(el).backgroundColor==='rgba(255, 255, 255, 0.94)')&&getComputedStyle(turnTail).backgroundColor==='rgba(0, 0, 0, 0)','turn action/time pills get the light meta surface while the full row stays transparent');
assert(getComputedStyle(statsPill).backgroundColor==='rgba(255, 255, 255, 0.94)','composer usage pill gets the light meta surface');
assert(getComputedStyle(contextTrigger).backgroundColor==='rgba(255, 255, 255, 0.94)'&&getComputedStyle(contextTrigger).color==='rgb(83, 91, 102)','context meter gets a readable local surface and caption');
assert(getComputedStyle(document.querySelector('.ppByMG_actions')).opacity==='0'&&getComputedStyle(document.querySelector('.ppByMG_action[data-unavailable]')).opacity==='0.4','host action reveal and unavailable opacity remain intact');
assert(getComputedStyle(document.querySelector('.ppByMG_timeStart')).color==='rgb(83, 91, 102)'&&getComputedStyle(document.querySelector('.IzP3Va_fileMeta')).color==='rgb(83, 91, 102)'&&getComputedStyle(document.querySelector('.OpZ85W_label')).color==='rgb(83, 91, 102)','time, file metadata, and usage labels use caption text');
assert(getComputedStyle(document.querySelector('.fixture-file-card')).backgroundColor==='rgb(255, 255, 255)','white file card remains white under the readability overrides');
assert(getComputedStyle(document.querySelector('.fixture-status-success')).color==='rgb(40, 120, 76)'&&getComputedStyle(document.querySelector('.fixture-status-error')).color==='rgb(161, 38, 56)','success and error status colors remain intact');
assert(getComputedStyle(messageInput).color==='rgb(41, 39, 42)'&&getComputedStyle(messageInput,'::placeholder').color==='rgb(83, 91, 102)'&&getComputedStyle(messageInput,'::placeholder').opacity==='1','composer input and placeholder remain readable at full placeholder opacity');
assert(getComputedStyle(composer).getPropertyValue('--dsh-skin-accent').trim()==='#D88F9E','accent colour is projected onto the composer');
assert(getComputedStyle(sidebar).backgroundColor==='rgba(255, 255, 255, 0.9)'&&getComputedStyle(sidebarColumn).backgroundColor==='rgba(0, 0, 0, 0)','sidebar root carries the light readability fill while its column stays transparent');
assert(getComputedStyle(sidebar.querySelector('._3WPZCG_newSession')).backgroundColor==='rgba(253, 248, 249, 0.82)','new-session action has its distinct toolbar surface');
assert(getComputedStyle(sidebar.querySelector('[aria-current="page"]')).backgroundColor==='rgb(248, 235, 238)','selected chat row gets a clear accent surface');
assert(getComputedStyle(composer.querySelector('.yhfFVG_row')).backgroundColor==='rgba(253, 248, 249, 0.82)','composer toolbar keeps its distinct tinted surface');
assert(getComputedStyle(composer.querySelector('.yhfFVG_primary')).backgroundColor!=='rgb(0, 0, 0)','send button receives the theme button fill');
assert(document.querySelector('input[aria-label="Message input"]')?.getBoundingClientRect().height>0,'composer input remains present and interactive');

// Mount the two host page shapes after skin activation: page navigation should
// receive scoped styles immediately without waiting for a slot rescan.
const pages=document.createElement('div');
pages.innerHTML=`<section data-plugin-panel><header class="ZVcBiW_pageHead"><div><h1>插件</h1><div style="color:var(--dsw-alias-label-secondary)">安装、启用和配置插件</div></div><div class="ZVcBiW_toolbar"><button>Refresh</button><button>Add plugin</button></div></header><section data-plugin-group="official"><h3>官方</h3><ul><li style="color:var(--dsw-alias-label-secondary)">插件说明</li></ul></section></section>
<div data-testid="task-manager-page"><div class="CxUija_pageHeading"><h1>自动化任务</h1><div class="CxUija_creationActions"><button>新建</button></div></div><div class="CxUija_filterTabs"><button class="CxUija_filterTab CxUija_filterTabActive" aria-pressed="true">全部</button><button class="CxUija_filterTab" aria-pressed="false">已开启</button></div><div class="CxUija_searchField"><input aria-label="Search tasks" placeholder="搜索自动化任务"></div><div class="CxUija_empty" role="status" style="color:var(--dsw-alias-label-tertiary)">还没有自动化任务</div><ul class="CxUija_listRows"><li>任务列表</li></ul></div>`;
document.querySelector('[data-slot="main"]').append(pages);
const localBoxes=[pages.querySelector('[data-plugin-panel] > header > div'),pages.querySelector('[data-plugin-group]'),...pages.querySelectorAll('.CxUija_filterTabs,.CxUija_searchField,.CxUija_empty,.CxUija_listRows')];
const search=pages.querySelector('input');
const pageHeadingBoxes=[pages.querySelector('.ZVcBiW_toolbar'),pages.querySelector('.CxUija_pageHeading > h1')];
assert(pageHeadingBoxes.every(el=>getComputedStyle(el).backgroundColor==='rgba(255, 255, 255, 0.94)'),'plugin toolbar and task title receive light header surfaces');
assert(getComputedStyle(pageHeadingBoxes[1]).flexGrow==='0'&&getComputedStyle(pages.querySelector('.CxUija_pageHeading')).backgroundColor==='rgba(0, 0, 0, 0)','task title remains a small local surface rather than a full-width strip');
assert(localBoxes.every(el=>getComputedStyle(el).backgroundColor==='rgba(255, 255, 255, 0.85)'),'new plugin and task page regions receive one readable light surface');
assert(getComputedStyle(pages.querySelector('li')).color==='rgb(83, 80, 88)','plugin descriptions inherit the scoped readable secondary color');
assert(getComputedStyle(search,'::placeholder').color==='rgb(83, 80, 88)'&&getComputedStyle(search,'::placeholder').opacity==='1','task search placeholder remains readable without an extra opacity reduction');
assert(getComputedStyle(pages.querySelector('.CxUija_filterTabActive')).backgroundColor!==getComputedStyle(pages.querySelector('.CxUija_filterTab:not(.CxUija_filterTabActive)')).backgroundColor,'task selected tab remains visibly distinct');

renderer.apply({...active,settings:{...active.settings,uiStyle:'basic'}});
await tick();
assert(html.getAttribute('data-dsh-skin-readable')==='light','basic light skin enables shared readability');
assert(getComputedStyle(contextTrigger).backgroundColor==='rgba(255, 255, 255, 0.94)'&&pageHeadingBoxes.every(el=>getComputedStyle(el).backgroundColor==='rgba(255, 255, 255, 0.94)'),'basic skin keeps context meter, plugin toolbar, and task title readable');
assert(getComputedStyle(header).backgroundColor==='rgba(255, 255, 255, 0.94)'&&getComputedStyle(sidebar).backgroundColor==='rgba(255, 255, 255, 0.9)'&&getComputedStyle(sidebarColumn).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(composer).backgroundColor==='rgba(255, 255, 255, 0.92)','basic light skin keeps readable header, sidebar, and composer surfaces');
assert(getComputedStyle(assistantRoot).backgroundColor==='rgba(255, 255, 255, 0.92)'&&getComputedStyle(document.querySelector('.ppByMG_timeStart')).backgroundColor==='rgba(255, 255, 255, 0.94)','basic light skin keeps readable assistant and metadata surfaces');
renderer.apply(active);
await tick();

html.className='dark';
await tick();
assert(!html.hasAttribute('data-dsh-skin-readable'),'dark mode releases the light-only readability marker');
assert(getComputedStyle(contextTrigger).backgroundColor==='rgba(0, 0, 0, 0)'&&pageHeadingBoxes.every(el=>getComputedStyle(el).backgroundColor==='rgba(0, 0, 0, 0)'),'dark mode removes light context and page-heading surfaces');
assert(Boolean(tint)&&getComputedStyle(tint).backgroundColor==='rgba(28, 28, 32, 0.12)','dark mode switches the wallpaper tint to a dark translucent fill');
assert(panelSurfaces.every((element,index)=>getComputedStyle(element).backgroundColor===(index===2?'rgba(67, 53, 60, 0.82)':'rgba(37, 35, 40, 0.82)')),'dark mode keeps local panels and composer tinted and translucent');
assert(localBoxes.every(el=>getComputedStyle(el).backgroundColor==='rgba(20, 18, 24, 0.85)'),'dark page surfaces cover bright wallpaper locally');
assert(getComputedStyle(assistantRoot).backgroundColor==='rgba(0, 0, 0, 0)','light assistant content surface is removed in dark mode');
assert(getComputedStyle(document.querySelector('.ppByMG_timeStart')).backgroundColor==='rgba(0, 0, 0, 0)','light turn metadata pill is removed in dark mode');
assert(getComputedStyle(pages.querySelector('li')).color==='rgb(224, 221, 227)','dark plugin descriptions use brighter secondary text');
renderer.apply({...active,settings:{...active.settings,uiStyle:'basic'}});
await tick();
assert(localBoxes.every(el=>getComputedStyle(el).backgroundColor==='rgba(20, 18, 24, 0.85)'),'basic skins retain page readability without refined decorations');
renderer.apply(active);
await tick();
html.className='';
html.style.colorScheme='';
document.body.setAttribute('data-ds-dark-theme','');
await tick();
assert(Boolean(tint)&&getComputedStyle(tint).backgroundColor==='rgba(28, 28, 32, 0.12)','host dark-theme projection is observed');
document.body.removeAttribute('data-ds-dark-theme');

const replacement=composer.cloneNode(true);
replacement.removeAttribute('data-dsh-skin-box');
composer.replaceWith(replacement);
await tick();
assert(!composer.hasAttribute('data-dsh-skin-box'),'removed composer box has its owned marker restored');
assert(replacement.getAttribute('data-dsh-skin-box')==='composer','replacement composer box receives the active skin');

renderer.apply(null);
await tick();
assert(layer.style.visibility==='hidden','apply(null) hides all decorations');
assert(!html.hasAttribute('data-dsh-skin-surface'),'apply(null) releases the surface marker');
assert(!html.hasAttribute('data-dsh-skin-readable'),'apply(null) releases the readability marker');
assert(getComputedStyle(contextTrigger).backgroundColor==='rgba(0, 0, 0, 0)'&&pageHeadingBoxes.every(el=>getComputedStyle(el).backgroundColor==='rgba(0, 0, 0, 0)'),'disable restores native context and page-heading surfaces');
assert(getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim()===originalSurfaceValue,`apply(null) restores ${originalSurface}`);
assert(getComputedStyle(viewArea).backgroundColor==='rgb(255, 255, 255)','nested base surfaces return to the host value');
assert(getComputedStyle(document.querySelector('.panel-one')).backgroundColor==='rgb(240, 240, 240)','local panel token returns to the host value');
assert(!replacement.hasAttribute('data-dsh-skin-box'),'apply(null) restores skin-owned box markers');
assert(!header.hasAttribute('data-dsh-skin-box'),'apply(null) restores the header box marker');
assert(!html.hasAttribute('data-dsh-skin-ui')&&!html.hasAttribute('data-dsh-skin-decorations'),'apply(null) restores UI mode markers');
assert(localBoxes.every(el=>getComputedStyle(el).backgroundColor==='rgba(0, 0, 0, 0)'),'disabling the skin removes all page readability surfaces');
assert(getComputedStyle(search,'::placeholder').color!=='rgb(83, 80, 88)','disabling the skin restores the native placeholder style');
pages.remove();
renderer.dispose();
assert(!document.querySelector('.dsh-skin-layer'),'dispose removes the decorative layer');
assertAppRegion(appRegion(document.querySelector('[data-window-drag]'))==='drag','disposing the skin leaves the host drag region unchanged');
assertAppRegion(appRegion(document.querySelector('.topbar button'))==='no-drag','disposing the skin leaves control regions unchanged');
assert(![...document.querySelectorAll('style')].some(node=>node.textContent.includes('data-dsh-skin-surface')),'dispose removes renderer CSS');

let resolveSlow;
const slowUrl=new Promise(resolve=>{resolveSlow=resolve;});
const fastPixel='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="8" height="8"%3E%3Crect width="8" height="8" fill="%2300ff00"/%3E%3C/svg%3E';
const raceRenderer=installRenderer({api:{state:async()=>({presets:[]}),assetUrl:id=>id==='slow'?slowUrl:id==='fast'?Promise.resolve(fastPixel):Promise.resolve('')}});
const raceLayer=document.querySelector('.dsh-skin-layer');
const raceImage=raceLayer?.querySelector('.dsh-skin-image');
raceRenderer.apply({...active,light:{backgroundId:'slow',characterId:null}});
raceRenderer.apply({...active,light:{backgroundId:'fast',characterId:null}});
await tick();
assert(raceImage?.getAttribute('src')===fastPixel,'latest fast preset wins while an earlier asset lookup is pending');
resolveSlow('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="8" height="8"%3E%3Crect width="8" height="8" fill="%23ff0000"/%3E%3C/svg%3E');
await tick();
assert(raceImage?.getAttribute('src')===fastPixel,'stale slow asset cannot replace the latest preset image');
raceRenderer.dispose();
assert(!raceLayer?.isConnected,'dispose removes the race renderer layer');

document.title=failures.length?`FAIL (${failures.length}) · Skin renderer browser checks`:skips?`PASS (${skips} SKIP) · Skin renderer browser checks`:'PASS · Skin renderer browser checks';
