'use strict';
// Test-only signed-token adapter; real OIDC is tested separately with Keycloak.
function fakeBff(tokens){return {routes(app){app.get('/auth/config',async()=>({enabled:true,manualTokenAllowed:false}))},tokenFor(req){const match=/(?:^|;\s*)fixture_actor=([a-z-]+)/.exec(String(req.headers.cookie||''));return match?tokens[match[1]]||null:null}}}
async function loginFixture(page,origin,actor){await page.context().addCookies([{name:'fixture_actor',value:actor,url:origin,httpOnly:true,sameSite:'Lax'}]);await page.goto(origin+'/?mode=api');try{await page.getByText('İş yeri seçin').waitFor()}catch(e){console.error('fixture page:',(await page.locator('body').innerText()).slice(0,600));throw e}await page.getByRole('button',{name:'Devam',exact:true}).click()}
module.exports={fakeBff,loginFixture};
