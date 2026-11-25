import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabaseUrl, supabasePublishableKey } from '../auth-config.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const base = new URL(process.argv[2] || 'https://harupick-travel.vercel.app');
if (!['http:','https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw Error('Use a public base URL without credentials or query parameters');
const paths = fs.readdirSync(root).filter(name => /\.(html|js|css|svg)$/.test(name));
for (const name of fs.readdirSync(path.join(root,'assets'))) if (/\.(jpg|png|webp|svg|js|txt)$/.test(name)) paths.push('assets/'+name);
const failures = [];
for (let offset=0; offset<paths.length; offset+=6) {
  await Promise.all(paths.slice(offset,offset+6).map(async name => {
    try {
      const response = await fetch(new URL(name,base.href.endsWith('/')?base:base.href+'/'),{signal:AbortSignal.timeout(15000)});
      if (response.status!==200) failures.push(name+': HTTP '+response.status);
      const type=response.headers.get('content-type') || '';
      if (name.endsWith('.js') && !/(java|ecma)script/.test(type)) failures.push(name+': invalid JavaScript MIME type');
      if (name.endsWith('.html') && !type.includes('text/html')) failures.push(name+': invalid HTML MIME type');
      await response.arrayBuffer();
    } catch { failures.push(name+': request failed'); }
  }));
}
const endpoints=[
 ['harupick_admin_context',{}],
 ['harupick_admin_members',{}],
 ['harupick_admin_member',{p_member_id:'00000000-0000-4000-8000-000000000000'}],
 ['harupick_trip_action',{p_action:'admin_list',p_args:{}}],
 ['harupick_admin_audit',{}]
];
for (const [name,body] of endpoints) {
  const response=await fetch(supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if (![401,403].includes(response.status)) failures.push(name+': anonymous access not denied (HTTP '+response.status+')');
}
const settingsResponse=await fetch(supabaseUrl+'/auth/v1/settings',{headers:{apikey:supabasePublishableKey},signal:AbortSignal.timeout(15000)});
const settings=await settingsResponse.json();
if (!settingsResponse.ok || !settings.external?.email || settings.disable_signup || settings.mailer_autoconfirm) failures.push('Auth email signup/login/confirmation configuration differs from the verified flow');
if (failures.length) { failures.forEach(message=>console.error(message)); process.exitCode=1; }
else console.log('PASS: '+paths.length+' production pages/assets returned HTTP 200; 5 protected RPCs denied anonymous access; email signup/login and confirmation configuration verified.');

