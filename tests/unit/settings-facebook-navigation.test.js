import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const settings=read('public/settings.js');
const server=read('src/server.js');
const index=read('public/index.html');
const css=read('public/settings-navigation.css');
test('Facebook-style Settings & Privacy navigation includes nested menu pages and back routes',()=>{
 for(const page of ['home','settings','help-support','report-support','display-accessibility','keyboard','language','privacy-checkup','privacy-center','help-center','scam-protection','account-status','about','career','developers','information'])assert.ok(settings.includes('data-settings-page="'+page+'"'),'missing page '+page);
 for(const item of ['Settings &amp; privacy','Help &amp; Support','Report &amp; Support','Display &amp; Accessibility','Privacy Checkup','Privacy Center','Scam Protection Center','Account Status','Support Inbox','Activity Center','Content Preferences','Accessibility Settings'])assert.ok(settings.includes(item),'missing menu item '+item);
 assert.ok(settings.includes('data-settings-back-page="home"'));
 assert.ok(settings.includes('settings-detail-back'));
 assert.ok(settings.includes('settings-more-menu'));
 assert.ok(index.includes('settings-navigation.css?v=20261110-facebook-settings-privacy-1'));
});
test('All existing settings sections and key controls are retained',()=>{
 for(const id of ['settings-account','settings-data','settings-privacy','settings-interaction-preferences','settings-blocking','settings-notifications','settings-calls','settings-preferences','settings-cache','settings-device-access','settings-help','settings-security','settings-signout'])assert.equal((settings.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'preserve '+id);
 assert.equal((settings.match(/data-settings-category-button=/g)||[]).length,9);
 for(const control of ['profileVisibility','messageAudience','notificationInApp','notificationFriendRequests','notificationMessages','theme','liteMode','download-account-data','security-email-form','support-ticket-form','settings-logout-btn'])assert.ok(settings.includes('name="'+control+'"')||settings.includes('id="'+control+'"'),'preserve '+control);
 assert.ok(settings.includes("renderThemeChoices('colorTheme', APP_THEMES"));
 assert.ok(settings.includes("renderThemeChoices('liveRoomTheme', LIVE_THEMES"));
 assert.ok(settings.includes('new FormData(settingsForm)'));
 assert.ok(settings.includes("api('/security/mfa')"));
 assert.ok(settings.includes("api('/security/sessions')"));
});
test('Dark mode, compact mode, keyboard and accessibility settings save through existing APIs',()=>{
 for(const field of ['keyboardShortcuts','experienceDensity','experienceContrast','experienceFontScale'])assert.ok(settings.includes('name="'+field+'"'),'missing persisted field '+field);
 assert.ok(settings.includes('data-settings-theme-value="system"'));
 assert.ok(settings.includes('MingloraExperience?.apply'));
 assert.ok(server.includes('keyboardShortcuts:false'));
 assert.ok(server.includes("'keyboardShortcuts'"));
 assert.ok(server.includes("['reducedMotion','liteMode','keyboardShortcuts'"));
 assert.ok(server.includes('validateExperienceSettingsPatch'));
 assert.ok(settings.includes("${sectionHeading('Keyboard')}"));
 assert.ok(settings.includes("${sectionHeading('Accessibility Settings')}"));
});
test('Account Status uses the authenticated account status and responsive styles are loaded',()=>{
 assert.ok(server.includes("status:user.status||'active'"));
 assert.ok(settings.includes('result.account?.status'));
 assert.ok(css.includes('.settings-facebook-row'));
 assert.ok(css.includes('@media(max-width:640px)'));
 assert.ok(css.includes('.settings-facebook-page[hidden]'));
 assert.ok(index.includes('settings-navigation.css?v=20261110-facebook-settings-privacy-1'));
});