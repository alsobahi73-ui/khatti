const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:'tests/server-browser',workers:1,timeout:30000,use:{baseURL:'http://127.0.0.1:4182',headless:true,launchOptions:{executablePath:process.env.CHROMIUM_PATH||(require('node:fs').existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']}}});
