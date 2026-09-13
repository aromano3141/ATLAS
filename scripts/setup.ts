import {existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {dataDir,loadConfig,saveConfig} from '../server/config.ts';
mkdirSync(dataDir,{recursive:true});saveConfig(loadConfig());
const secrets=join(dataDir,'secrets.env');
if(!existsSync(secrets))writeFileSync(secrets,'OPENAI_API_KEY=\nSLACK_BOT_TOKEN=\nSLACK_APP_TOKEN=\nSLACK_USER_TOKEN=\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\nGOOGLE_REFRESH_TOKEN=\nJIRA_API_TOKEN=\nGOOGLE_MAPS_API_KEY=\n',{mode:0o600});
console.log('Local setup files are ready in '+dataDir+'. Edit secrets.env locally; never paste tokens into chat. Use Connections to configure resource IDs.');
