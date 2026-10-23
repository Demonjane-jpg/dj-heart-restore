const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/dj-heart-restore.js', 'utf8');
const A = 'spotify:track:AAAAAAAAAAAAAAAAAAAAAA';
const B = 'spotify:track:BBBBBBBBBBBBBBBBBBBBBB';
const defer = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i=0;i<12;i++) await new Promise(setImmediate); };

function setup(options = {}) {
  const timers = new Set(), intervals = [], listeners = {}, libListeners = {};
  const writes = [], notifications = [], library = new Set(), buttons = [];
  let now = 1000;
  class Element {
    constructor() { this.dataset={}; this.attrs={}; this.innerHTML=''; this.isConnected=false; }
    setAttribute(k,v) { this.attrs[k]=v; }
    removeAttribute(k) { delete this.attrs[k]; }
    append(el) { el.isConnected=true;el.parentElement=this; }
    contains(el) { return el.parentElement===this; }
    remove() { this.isConnected=false; }
    addEventListener(k,fn) { this[k]=fn; }
  }
  const head=new Element(), body=new Element(), host=new Element();
  const document = {head,body,createElement:(tag)=>{const el=new Element();if(tag==='button')buttons.push(el);return el;},querySelector:(selector)=>selector==='[data-testid="now-playing-widget-v2"]'?(options.v2?host:null):host};
  const events = {
    addListener(k,fn) { (libListeners[k] ||= new Set()).add(fn); },
    removeListener(k,fn) { libListeners[k]?.delete(fn); }
  };
  const lib = {
    async contains(uri) { return [library.has(uri)]; },
    async add({uris}) { writes.push(['add',...uris]); uris.forEach(u=>library.add(u)); },
    async remove({uris}) { writes.push(['remove',...uris]); uris.forEach(u=>library.delete(u)); },
    getEvents:()=>events
  };
  const Player = {
    data: {item:{uri:A,metadata:{}}},
    addEventListener(k,fn) { (listeners[k] ||= new Set()).add(fn); },
    removeEventListener(k,fn) { listeners[k]?.delete(fn); }
  };
  class Widget {
    constructor(label,icon,fn) { this.element=new Element(); this.onClick=fn; this.element.click=()=>{ if(!this.element.disabled) fn(); }; buttons.push(this.element); if(!options.detached)this.element.isConnected=true; }
    set icon(x) { this._icon=x; this.element.innerHTML=x; } get icon(){return this._icon;}
    set disabled(x) { this.element.disabled=x; }
    deregister() { this.element.remove(); }
  }
  const context = {
    window: {Spicetify:{Player, Platform:{LibraryAPI:lib},Playbar:options.fallback ? {} : {Widget},showNotification:(...x)=>notifications.push(x)},addEventListener(){},removeEventListener(){}},
    document,console:{debug(){},warn(){},error(){}},
    setTimeout(fn,ms) { const id=setTimeout(()=>{timers.delete(id);fn();},ms>=5000?35:Math.min(ms,5)); timers.add(id); return id; },
    clearTimeout(id) { clearTimeout(id);timers.delete(id); },
    setInterval(fn) { intervals.push(fn);return fn; }, clearInterval(){},
    MutationObserver:class {observe(){} disconnect(){}},
    Date:{now:()=>now}
  };
  vm.createContext(context); vm.runInContext(source,context);
  const api=()=>context.window.__djHeartRestore;
  return {context,api,Player,lib,library,writes,notifications,buttons,libListeners,listeners,host,
    click:()=> {const b=buttons.at(-1);if(b.disabled)return; b.click();},
    change(next, metadata={}) {Player.data=next?{item:{uri:next,metadata}}:null;for(const f of listeners.songchange||[])f();},
    poll:()=>intervals.at(-1)(),
    advance(ms) {now+=ms;intervals.at(-1)();},
    emit(name) {for(const f of libListeners[name]||[])f();},
    cleanup(){api()?.dispose();timers.forEach(clearTimeout);}
  };
}

test('saves and removes the exact track, using confirmed library state', async()=>{
  const s=setup();try {await flush();assert.equal(s.api().getState().saved,false);s.click();await flush();assert.equal(s.api().getState().saved,true);assert.deepEqual(s.writes,[['add',A]]);s.click();await flush();assert.equal(s.api().getState().saved,false);assert.deepEqual(s.writes,[['add',A],['remove',A]]);}finally{s.cleanup();}
});
test('duplicate clicks issue one write',async()=>{
 const s=setup();try {await flush();s.click();s.click();s.click();await flush();assert.equal(s.writes.length,1);}finally{s.cleanup();}
});
test('track changes during click preflight cancel the write',async()=>{
 const s=setup();try {await flush();const d=defer();s.lib.contains=()=>d.promise;s.click();s.change(B);d.resolve([false]);await flush();assert.equal(s.writes.length,0);}finally{s.cleanup();}
});
test('track changes during write never redirect the captured URI or paint the next song green',async()=>{
 const s=setup();try {await flush();const d=defer();s.lib.add=({uris})=>{s.writes.push(['add',...uris]);return d.promise;};s.click();await flush();s.change(B);await flush();s.library.add(A);d.resolve();await flush();assert.deepEqual(s.writes,[['add',A]]);assert.equal(s.api().getState().uri,B);assert.equal(s.api().getState().saved,false);}finally{s.cleanup();}
});
test('slow reads from old tracks cannot overwrite the current track state',async()=>{
 const s=setup();try {await flush();const d=defer();s.lib.contains=u=>u===A?d.promise:Promise.resolve([true]);s.api().refresh();s.change(B);d.resolve([false]);await flush();assert.equal(s.api().getState().saved,true);assert.equal(s.api().getState().uri,B);}finally{s.cleanup();}
});
test('library events and periodic checks synchronize likes made elsewhere',async()=>{
 const s=setup();try {await flush();s.library.add(A);s.emit('operation_complete');await new Promise(r=>setTimeout(r,15));await flush();assert.equal(s.api().getState().saved,true);s.library.delete(A);s.poll();await flush();assert.equal(s.api().getState().saved,false);}finally{s.cleanup();}
});
test('local files, episodes, missing, and explicitly unavailable tracks cannot be liked',async()=>{
 const s=setup();try {await flush();for(const uri of ['spotify:local:artist:album:name:123','spotify:episode:AAAAAAAAAAAAAAAAAAAAAA',null]){s.change(uri);await flush();s.click();assert.equal(s.api().getState().uri,null);}s.change(A,{is_playable:'false'});await flush();s.click();assert.equal(s.writes.length,0);}finally{s.cleanup();}
});
test('failure does not fake a saved state and reports an error',async()=>{
 const s=setup();try {await flush();s.lib.add=()=>Promise.reject(new Error('offline'));s.click();await flush();assert.notEqual(s.api().getState().saved,true);assert.equal(s.notifications.length,1);}finally{s.cleanup();}
});
test('a successful request without confirmed saved state is rejected',async()=>{
 const s=setup();try {await flush();s.lib.add=async()=>{};s.click();await new Promise(r=>setTimeout(r,60));await flush();assert.notEqual(s.api().getState().saved,true);assert.equal(s.notifications.length,1);}finally{s.cleanup();}
});
test('timed out writes stay locked until their original promise settles',async()=>{
 const s=setup();try {await flush();const d=defer();s.lib.add=()=>d.promise;s.click();await new Promise(r=>setTimeout(r,50));assert.equal(s.api().getState().pending,1);s.click();assert.equal(s.notifications.length,1);s.library.add(A);d.resolve();await flush();assert.equal(s.api().getState().pending,0);assert.equal(s.api().getState().saved,true);}finally{s.cleanup();}
});
test('reinjection and disposal clean up the previous widget and event listeners',async()=>{
 const s=setup();try {await flush();const old=s.api();vm.runInContext(source,s.context);await flush();assert.equal(s.buttons.length,2);assert.equal(s.buttons[0].isConnected,false);assert.equal(s.listeners.songchange.size,1);assert.equal(s.libListeners.operation_complete.size,1);s.api().dispose();assert.equal(s.listeners.songchange.size,0);assert.equal(s.libListeners.operation_complete.size,0);assert.equal(s.context.window.__djHeartRestore,undefined);old.dispose();}finally{s.cleanup();}
});
test('Widget remount fallback restores a detached control',async()=>{
 const s=setup({detached:true});try {await flush();s.advance(2000);await flush();assert.equal(s.api().getState().mounted,true);}finally{s.cleanup();}
});
test('disposal during click preflight prevents any subsequent write',async()=>{
 const s=setup();try {await flush();const d=defer();s.lib.contains=()=>d.promise;s.click();s.api().dispose();d.resolve([false]);await flush();assert.equal(s.writes.length,0);}finally{s.cleanup();}
});
test('fallback without Playbar.Widget mounts a native accessible button and saves',async()=>{
 const s=setup({fallback:true});try {await flush();assert.equal(s.api().getState().placement,'player-bar fallback');assert.equal(s.api().getState().mounted,true);const button=s.buttons[0];assert.equal(button.type,'button');assert.equal(button.attrs['aria-pressed'],'false');s.click();await flush();assert.deepEqual(s.writes,[['add',A]]);assert.equal(button.attrs['aria-pressed'],'true');}finally{s.cleanup();}
});
test('stale button cancels a click even if songchange has not fired yet',async()=>{
 const s=setup();try {await flush();s.Player.data.item.uri=B;s.click();await flush();assert.equal(s.writes.length,0);assert.equal(s.api().getState().uri,B);}finally{s.cleanup();}
});
test('unknown library responses disable writes rather than assuming unliked',async()=>{
 const s=setup();try {await flush();s.lib.contains=async()=>({saved:false});await s.api().refresh();assert.equal(s.api().getState().saved,null);s.click();await flush();assert.equal(s.writes.length,0);}finally{s.cleanup();}
});
test('modern semantic host repairs a connected Widget placed outside track details',async()=>{
 const s=setup({v2:true});try {await flush();assert.equal(s.buttons[0].parentElement,s.host);assert.equal(s.api().getState().placementFallback,true);s.buttons[0].parentElement={};s.poll();await flush();assert.equal(s.buttons[0].parentElement,s.host);}finally{s.cleanup();}
});
