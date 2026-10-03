import test from 'node:test';
import assert from 'node:assert/strict';
import {installRenderer} from '../src/client/renderer.js';

class FakeStyle {
  constructor(){this.values=new Map();this.writes=0;}
  setProperty(name,value){value=String(value);if(this.getPropertyValue(name)!==value){this.values.set(name,value);this.writes++;}}
  getPropertyValue(name){return this.values.get(name)||'';}
  removeProperty(name){if(this.values.delete(name))this.writes++;}
}
const toDataKey=name=>name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
class FakeElement {
  constructor(tag,doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.attributes=new Map();this.style=new FakeStyle();this.children=[];this.parentElement=null;this.textContent='';}
  set className(v){this.setAttribute('class',v)} get className(){return this.getAttribute('class')||'';}
  get classList(){return {contains:n=>this.className.split(/\s+/).includes(n)}}
  get dataset(){const out={};for(const [k,v] of this.attributes)if(k.startsWith('data-'))out[toDataKey(k)]=v;return out;}
  get firstElementChild(){return this.children[0]||null;}
  get isConnected(){return this===this.ownerDocument.body||this===this.ownerDocument.documentElement||Boolean(this.parentElement?.isConnected);}
  append(...nodes){for(const n of nodes){n.remove();n.parentElement=this;this.children.push(n)}}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.parentElement=null;}
  replaceWith(node){if(!this.parentElement)return;const parent=this.parentElement;const index=parent.children.indexOf(this);this.parentElement=null;node.remove();node.parentElement=parent;parent.children[index]=node;}
  setAttribute(k,v){this.attributes.set(k,String(v))} getAttribute(k){return this.attributes.has(k)?this.attributes.get(k):null;}
  hasAttribute(k){return this.attributes.has(k)} removeAttribute(k){this.attributes.delete(k)}
  set innerHTML(markup){this.children=[];for(const m of markup.matchAll(/<(img|div)\s+class="([^"]+)"([^>]*)>/g)){const [,tag,classes,rest]=m;const el=new FakeElement(tag,this.ownerDocument);el.className=classes;for(const a of rest.matchAll(/([\w-]+)="([^"]*)"/g))el.setAttribute(a[1],a[2]);this.append(el)}}
  get innerHTML(){return ''}
  matches(selector){return selector.split(',').some(s=>{s=s.trim();const tag=s.match(/^[a-z]+/i)?.[0];if(tag&&this.tagName.toLowerCase()!==tag.toLowerCase())return false;const withoutAttrs=s.replace(/\[[^\]]+\]/g,'');for(const [,c] of withoutAttrs.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(c))return false;const attrs=s.match(/\[[^\]]+\]/g)||[];for(let body of attrs){body=body.slice(1,-1);const equals=body.indexOf('=');const a=equals<0?body:body.slice(0,equals);if(!this.hasAttribute(a))return false;if(equals>=0){let value=body.slice(equals+1);if(value.startsWith('"')||value.startsWith("'"))value=value.slice(1,-1);if(this.getAttribute(a)!==value)return false;}}return true})}
  querySelectorAll(selector){const out=[];const walk=n=>{for(const c of n.children){if(c.matches(selector))out.push(c);walk(c)}};walk(this);return out}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null}
  closest(selector){for(let n=this;n;n=n.parentElement)if(n.matches(selector))return n;return null}
  getBoundingClientRect(){return {width:100,height:100}}
}
class FakeDocument {
  constructor(){this.documentElement=new FakeElement('html',this);this.head=new FakeElement('head',this);this.body=new FakeElement('body',this);this.documentElement.append(this.head,this.body);}
  createElement(tag){return new FakeElement(tag,this)}
  querySelector(selector){if(this.documentElement.matches(selector))return this.documentElement;return this.documentElement.querySelector(selector)}
  querySelectorAll(selector){return this.documentElement.querySelectorAll(selector)}
}
class FakeObserver {
  static all=[];
  constructor(callback){this.callback=callback;FakeObserver.all.push(this)}
  observe(target,options){this.target=target;this.options=options}
  disconnect(){this.disconnected=true}
  trigger(records){this.callback(records)}
}

function setup(){
  const doc=new FakeDocument();
  const sidebarSlot=new FakeElement('div',doc);sidebarSlot.setAttribute('data-slot','sidebar');const sidebarWrap=new FakeElement('div',doc);sidebarWrap.style.display='contents';const sidebar=new FakeElement('aside',doc);sidebar.style.display='block';sidebar.setAttribute('data-dsh-skin-box','host-sidebar');sidebarWrap.append(sidebar);sidebarSlot.append(sidebarWrap);doc.body.append(sidebarSlot);
  const card=new FakeElement('div',doc);card.setAttribute('data-composer-card','');const composerSlot=new FakeElement('div',doc);composerSlot.setAttribute('data-slot','conversation.composer.bar');composerSlot.setAttribute('data-dsh-skin-owned','host-composer');composerSlot.style.setProperty('--dsh-skin-accent-value','host-accent');card.append(composerSlot);doc.body.append(card);
  const message=new FakeElement('article',doc);message.setAttribute('data-chat-flow-key','m1');message.setAttribute('data-chat-flow-kind','user');doc.body.append(message);
  const header=new FakeElement('header',doc);header.className='ST7X_W_header';header.setAttribute('data-dsh-skin-box','host-header');doc.body.append(header);
  const frames=[];let frameId=0;const win={matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),getComputedStyle:el=>({display:el.style.display||'block'}),requestAnimationFrame:fn=>{frames.push([++frameId,fn]);return frameId},cancelAnimationFrame:id=>{const i=frames.findIndex(x=>x[0]===id);if(i>=0)frames.splice(i,1)}};
  return {doc,win,frames,sidebar,sidebarSlot,composerSlot,card,message,header};
}
const preset=(uiStyle='refined')=>({id:'p',name:'p',light:{backgroundId:null,characterId:null},dark:{backgroundId:null,characterId:null},settings:{accent:'#D88F9E',panelOpacity:.7,uiStyle,decorations:true}});
async function drain(frames){for(let i=0;i<8&&frames.length;i++){const batch=frames.splice(0);for(const [,fn] of batch)fn();await new Promise(resolve=>setImmediate(resolve));}}

test('renderer leases refined boxes and restores legacy composer focus and host values in basic',async t=>{
  const previous=globalThis.MutationObserver;globalThis.MutationObserver=FakeObserver;FakeObserver.all=[];
  t.after(()=>{globalThis.MutationObserver=previous});
  const {doc,win,frames,sidebar,composerSlot,card,message}=setup();
  assert.equal(doc.querySelector("[data-composer-card]"),card);
  assert.equal(doc.querySelector(`[data-slot="conversation.composer.bar"]`),composerSlot);


  const renderer=installRenderer({api:{state:async()=>({presets:[]}),assetUrl:async()=>''},document:doc,window:win});
  renderer.apply(preset());await drain(frames);
  assert.equal(doc.documentElement.getAttribute('data-dsh-skin-ui'),'refined');
  assert.equal(sidebar.getAttribute('data-dsh-skin-box'),'sidebar');
  assert.equal(card.getAttribute('data-dsh-skin-box'),'composer');
  assert.equal(message.getAttribute('data-dsh-skin-box'),'message');
  assert.equal(composerSlot.getAttribute('data-dsh-skin-owned'),'composer');
  assert.equal(composerSlot.style.getPropertyValue('--dsh-skin-accent-value'),'#D88F9E');

  renderer.apply(preset('basic'));await drain(frames);
  assert.equal(doc.documentElement.getAttribute('data-dsh-skin-ui'),null);
  assert.equal(sidebar.getAttribute('data-dsh-skin-box'),'host-sidebar');
  assert.equal(card.hasAttribute('data-dsh-skin-box'),false);
  assert.equal(message.hasAttribute('data-dsh-skin-box'),false);
  assert.equal(composerSlot.getAttribute('data-dsh-skin-owned'),'host-composer');
  assert.equal(composerSlot.style.getPropertyValue('--dsh-skin-accent-value'),'host-accent');
  assert.equal(doc.documentElement.getAttribute('data-dsh-skin-surface'),null,'basic without assets releases the wallpaper surface');
  assert.equal(doc.documentElement.style.getPropertyValue('--dsh-skin-surface-value'),'');
  assert.equal(doc.documentElement.style.getPropertyValue('--dsh-skin-panel-value'),'');
  assert.equal(doc.documentElement.style.getPropertyValue('--dsh-skin-box-fill'),'');

  renderer.apply(null);await drain(frames);
  assert.equal(composerSlot.getAttribute('data-dsh-skin-owned'),'host-composer');
  assert.equal(composerSlot.style.getPropertyValue('--dsh-skin-accent-value'),'host-accent');
  assert.equal(sidebar.getAttribute('data-dsh-skin-box'),'host-sidebar');
  assert.equal(doc.documentElement.getAttribute('data-dsh-skin-surface'),null);
  renderer.dispose();
});

test('refined header uses one lease, rescans replacements, and restores host values across basic and disable',async t=>{
  const previous=globalThis.MutationObserver;globalThis.MutationObserver=FakeObserver;FakeObserver.all=[];
  t.after(()=>{globalThis.MutationObserver=previous});
  const {doc,win,frames,header}=setup();
  const html=doc.documentElement;
  for(const [name,value] of [['--dsh-skin-header-fill','host-fill'],['--dsh-skin-header-ink','host-ink'],['--dsh-skin-header-muted','host-muted'],['--dsh-skin-header-accent','host-accent']]) html.style.setProperty(name,value);
  const renderer=installRenderer({api:{state:async()=>({presets:[]}),assetUrl:async()=>''},document:doc,window:win});
  renderer.apply(preset());await drain(frames);
  assert.equal(header.getAttribute('data-dsh-skin-box'),'header');
  assert.equal(html.style.getPropertyValue('--dsh-skin-header-fill'),renderer.getUiTheme(preset().settings,false).headerFill);
  assert.match(doc.head.children[0].textContent,/\[data-dsh-skin-ui="refined"\] \[data-dsh-skin-box="header"\]/);
  assert.match(doc.head.children[0].textContent,/--dsw-alias-label-tertiary: var\(--dsh-skin-header-muted\)/);

  const replacement=new FakeElement('header',doc);replacement.className='ST7X_W_header';header.replaceWith(replacement);
  const observer=FakeObserver.all.find(item=>item.target===doc.body);
  observer.trigger([{type:'childList',target:doc.body,addedNodes:[replacement],removedNodes:[header]}]);
  await drain(frames);
  assert.equal(header.getAttribute('data-dsh-skin-box'),'host-header');
  assert.equal(replacement.getAttribute('data-dsh-skin-box'),'header');

  renderer.apply(preset('basic'));await drain(frames);
  assert.equal(replacement.hasAttribute('data-dsh-skin-box'),false);
  assert.equal(html.getAttribute('data-dsh-skin-ui'),null);
  assert.equal(html.style.getPropertyValue('--dsh-skin-header-fill'),'host-fill');
  renderer.apply(preset());await drain(frames);
  assert.equal(replacement.getAttribute('data-dsh-skin-box'),'header');
  renderer.apply(null);await drain(frames);
  assert.equal(replacement.hasAttribute('data-dsh-skin-box'),false);
  assert.equal(html.style.getPropertyValue('--dsh-skin-header-fill'),'host-fill');
  assert.equal(html.style.getPropertyValue('--dsh-skin-header-ink'),'host-ink');
  assert.equal(html.style.getPropertyValue('--dsh-skin-header-muted'),'host-muted');
  assert.equal(html.style.getPropertyValue('--dsh-skin-header-accent'),'host-accent');
  renderer.dispose();
});

test('style observer reaches a stable RAF and does not repeatedly rewrite UI variables',async t=>{
  const previous=globalThis.MutationObserver;globalThis.MutationObserver=FakeObserver;FakeObserver.all=[];
  t.after(()=>{globalThis.MutationObserver=previous});
  const {doc,win,frames}=setup();
  const renderer=installRenderer({api:{state:async()=>({presets:[]}),assetUrl:async()=>''},document:doc,window:win});
  renderer.apply(preset());await drain(frames);
  const observer=FakeObserver.all.find(item=>item.target===doc.documentElement);
  const writes=doc.documentElement.style.writes;
  observer.trigger([{type:'attributes',target:doc.documentElement,attributeName:'style'}]);
  await drain(frames);
  assert.equal(frames.length,0);
  assert.equal(doc.documentElement.style.writes,writes,'same palette values do not mutate the observed style again');
  renderer.dispose();
});

test('palette keeps the actual white button text and brand labels above 4.5:1 contrast',()=>{
  const luminance=hex=>hex.slice(1).match(/../g).map(part=>parseInt(part,16)).map(value=>{const c=value/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
  const ratio=(a,b)=>{const hi=Math.max(a,b),lo=Math.min(a,b);return (hi+.05)/(lo+.05)};
  const rgbLuminance=color=>{const rgb=color.match(/\d+/g).slice(0,3).map(Number);return luminance(`#${rgb.map(value=>value.toString(16).padStart(2,'0')).join('')}`)};
  for(const accent of ['#D88F9E','#FFFFFF','#000000','#808080','#FF0000','#00FF00','#0000FF']){
    const theme=installRenderer.getUiTheme({accent},false);
    assert.equal(theme.buttonText,'#FFFFFF');
    assert.ok(ratio(luminance(theme.button),1)>=4.5,`${accent}: button text contrast`);
    assert.ok(ratio(luminance(theme.brand),rgbLuminance(theme.composerFill))>=4.5,`${accent}: brand label contrast on the actual light composer fill`);
    const dark=installRenderer.getUiTheme({accent},true);
    assert.ok(ratio(luminance(dark.brand),rgbLuminance(dark.selected))>=4.5,`${accent}: dark brand label contrast on the actual selected fill`);
    const composite=(rgb,alpha,backdrop)=>rgb.map((value,index)=>value*alpha+backdrop[index]*(1-alpha));
    const luminanceRgb=rgb=>rgb.map(value=>{const c=value/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
    assert.ok(ratio(luminance(theme.headerInk),luminanceRgb(composite([255,255,255],.94,[0,0,0])))>=4.5,`${accent}: light header ink contrast over the worst-case black wallpaper`);
    assert.ok(ratio(luminance(theme.headerMuted),luminanceRgb(composite([255,255,255],.94,[0,0,0])))>=4.5,`${accent}: light header muted label contrast over the worst-case black wallpaper`);
    assert.ok(ratio(luminance(theme.headerAccent),luminanceRgb(composite([255,255,255],.94,[0,0,0])))>=4.5,`${accent}: light header accent contrast over the worst-case black wallpaper`);
    assert.ok(ratio(luminance(dark.headerInk),luminanceRgb(composite([20,18,24],.88,[255,255,255])))>=4.5,`${accent}: dark header ink contrast over the worst-case white wallpaper`);
    assert.ok(ratio(luminance(dark.headerMuted),luminanceRgb(composite([20,18,24],.88,[255,255,255])))>=4.5,`${accent}: dark header muted label contrast over the worst-case white wallpaper`);
    assert.ok(ratio(luminance(dark.headerAccent),luminanceRgb(composite([20,18,24],.88,[255,255,255])))>=4.5,`${accent}: dark header accent contrast over the worst-case white wallpaper`);
    assert.equal(theme.headerFill,'rgba(255,255,255,0.94)');
    assert.equal(dark.headerFill,'rgba(20,18,24,0.88)');
    assert.equal(theme.headerMuted,'#535058');
    assert.equal(dark.headerMuted,'#ded9df');
    assert.ok(ratio(luminance(theme.headerMuted),luminanceRgb(composite([255,255,255],.94,[0,0,0])))>=4.5,`${accent}: light header muted label contrast over the worst-case black wallpaper`);
    assert.ok(ratio(luminance(dark.headerMuted),luminanceRgb(composite([20,18,24],.88,[255,255,255])))>=4.5,`${accent}: dark header muted label contrast over the worst-case white wallpaper`);
  }
  const refined=installRenderer.getUiTheme({accent:'#D88F9E',panelOpacity:.7,uiStyle:'refined'},false);
  assert.equal(refined.wallpaperTint,'rgba(255,255,255,0.12)');
  assert.equal(refined.panel,'rgba(253,251,251,0.82)');
  assert.equal(refined.sidebarFill,'rgba(253,248,249,0.82)');
  assert.equal(refined.composerFill,'rgba(251,244,245,0.82)');
  assert.equal(refined.messageFill,'rgba(254,251,252,0.82)');
  assert.notEqual(refined.selected,refined.panel,'selected state is a distinct solid accent tint');
  const basic=installRenderer.getUiTheme({accent:'#D88F9E',panelOpacity:.7,uiStyle:'basic'},false);
  assert.equal(basic.wallpaperTint,'rgba(255,255,255,0)');
  assert.equal(basic.panel,'rgba(255,255,255,0.7)');
  assert.equal(installRenderer.getUiTheme({accent:'#D88F9E',panelOpacity:.95,uiStyle:'refined'},false).wallpaperTint,'rgba(255,255,255,0.12)');
  assert.equal(installRenderer.getUiTheme({accent:'#D88F9E',panelOpacity:.95,uiStyle:'refined'},true).wallpaperTint,'rgba(28,28,32,0.12)');
});

test('basic with a wallpaper keeps native UI state, separates overlay from panel opacity, and layers character over the shade',async t=>{
  const previous=globalThis.MutationObserver;globalThis.MutationObserver=FakeObserver;FakeObserver.all=[];
  t.after(()=>{globalThis.MutationObserver=previous});
  const {doc,win,frames,sidebar,composerSlot,card,message}=setup();
  const html=doc.documentElement;
  html.style.setProperty('--dsh-skin-panel-value','host-panel');
  html.style.setProperty('--dsh-skin-box-fill','host-box-fill');
  const api={state:async()=>({presets:[]}),assetUrl:async id=>id?`asset:${id}`:''};
  const renderer=installRenderer({api,document:doc,window:win});
  const basic={...preset('basic'),light:{backgroundId:'wallpaper',characterId:'person'},settings:{...preset('basic').settings,overlay:.4,panelOpacity:.9}};
  renderer.apply({...basic,settings:{...basic.settings,uiStyle:'refined'}});await drain(frames);
  assert.notEqual(html.style.getPropertyValue('--dsh-skin-panel-value'),'host-panel');
  assert.equal(composerSlot.getAttribute('data-dsh-skin-owned'),'composer');
  assert.equal(composerSlot.style.getPropertyValue('--dsh-skin-accent-value'),'#D88F9E');
  renderer.apply(basic);await drain(frames);
  assert.equal(html.getAttribute('data-dsh-skin-surface'),'');
  assert.equal(html.getAttribute('data-dsh-skin-ui'),null);
  assert.equal(html.getAttribute('data-dsh-skin-decorations'),null);
  assert.equal(html.style.getPropertyValue('--dsh-skin-surface-value'),'rgba(255,255,255,0)');
  assert.equal(html.style.getPropertyValue('--dsh-skin-panel-value'),'host-panel');
  assert.equal(html.style.getPropertyValue('--dsh-skin-box-fill'),'host-box-fill');
  assert.equal(sidebar.getAttribute('data-dsh-skin-box'),'host-sidebar');
  assert.equal(card.hasAttribute('data-dsh-skin-box'),false);
  assert.equal(message.hasAttribute('data-dsh-skin-box'),false);
  assert.equal(composerSlot.getAttribute('data-dsh-skin-owned'),'host-composer');
  assert.equal(composerSlot.style.getPropertyValue('--dsh-skin-accent-value'),'host-accent');
  assert.match(doc.head.children[0].textContent,/html\[data-dsh-skin-surface\]\[data-dsh-skin-ui="refined"\] body/);
  assert.match(doc.head.children[0].textContent,/\.dsh-skin-character \{ z-index: 1; \}/);
  assert.match(doc.head.children[0].textContent,/--dsh-overlay/);
  renderer.dispose();
});

test('sidebar root replacement and message kind changes rescan only supported boxes',async t=>{
  const previous=globalThis.MutationObserver;globalThis.MutationObserver=FakeObserver;FakeObserver.all=[];
  t.after(()=>{globalThis.MutationObserver=previous});
  const {doc,win,frames,sidebar,sidebarSlot,message}=setup();
  const renderer=installRenderer({api:{state:async()=>({presets:[]}),assetUrl:async()=>''},document:doc,window:win});
  renderer.apply(preset());await drain(frames);
  const next=new FakeElement('aside',doc);next.style.display='block';sidebar.replaceWith(next);
  const host=FakeObserver.all.find(item=>item.target===doc.body);
  host.trigger([{type:'childList',target:sidebarSlot,addedNodes:[next],removedNodes:[sidebar]}]);
  await drain(frames);
  assert.equal(sidebar.getAttribute('data-dsh-skin-box'),'host-sidebar');
  assert.equal(next.getAttribute('data-dsh-skin-box'),'sidebar');
  message.setAttribute('data-chat-flow-kind','tool-call');
  host.trigger([{type:'attributes',target:message,attributeName:'data-chat-flow-kind'}]);
  await drain(frames);
  assert.equal(message.hasAttribute('data-dsh-skin-box'),false);
  renderer.dispose();
});
