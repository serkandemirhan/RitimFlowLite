const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../integration/premium-api.js'),'utf8');
const helpers=source.slice(source.indexOf(' function preferredMembership()'),source.indexOf(' async function initializeAuth()'));
function setup(memberships,saved,denied=false){
 const calls=[],data=new Map(Object.entries(saved||{}));
 const context={session:{identity:{id:'user-a'},memberships},localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},RitimLegacyRecovery:{cleanupBrowser(){}},api:{async selectScope(t,s){calls.push([t,s]);if(denied)throw Error('denied');return {roles:['operator'],capabilities:[]}}},async enterScope(c){calls.push(c)},clearSite(){calls.push('cleared')}};
 vm.createContext(context);vm.runInContext(helpers,context);return {context,calls,data};
}
const a={tenantId:'a',siteId:'1'},b={tenantId:'b',siteId:'2'},key='ritim:last-workspace:v1:user-a';
test('single workspace enters automatically and revalidates capabilities',async()=>{const x=setup([a]);await x.context.restoreMembership();assert.deepEqual(x.calls[0],['a','1']);assert.equal(JSON.parse(x.data.get(key)).siteId,'1')});
test('multiple workspaces restore the current user preference',async()=>{const x=setup([a,b],{[key]:JSON.stringify(b)});await x.context.restoreMembership();assert.deepEqual(x.calls[0],['b','2'])});
test('another user preference and revoked memberships are ignored',async()=>{for(const saved of [{ 'ritim:last-workspace:v1:user-b':JSON.stringify(b)},{[key]:JSON.stringify({tenantId:'revoked',siteId:'3'})},{[key]:'invalid'}]){const x=setup([a,b],saved);await x.context.restoreMembership();assert.equal(x.calls.length,0)}});
test('denied scope clears view and does not save a new preference',async()=>{const x=setup([a],{},true);await assert.rejects(x.context.restoreMembership(),/denied/);assert.equal(x.calls.at(-1),'cleared');assert.equal(x.data.size,0)});
test('manual change saves the new workspace',async()=>{const x=setup([a,b],{[key]:JSON.stringify(a)});await x.context.activateMembership(b);assert.equal(JSON.parse(x.data.get(key)).tenantId,'b')});
test('unavailable preference storage does not prevent single-workspace entry',async()=>{const x=setup([a]);x.context.localStorage={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};await x.context.restoreMembership();assert.equal(x.calls.length,2)});
