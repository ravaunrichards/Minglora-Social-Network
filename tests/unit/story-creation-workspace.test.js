import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Profile Add to story opens a dedicated Your story workspace with both creation paths', async () => {
  const app = await read('../../public/app.js');
  const html = await read('../../public/index.html');
  const css = await read('../../public/story-workspace.css');
  assert.match(app, /\$\('#profile-add-story'\)\?\.addEventListener\('click',\(\)=>openStoryComposer\(\)\)/);
  assert.ok(app.includes("'/story/create'"), 'story workspace has a restorable page route');
  assert.ok(app.includes('data-story-start="media"'));
  assert.ok(app.includes('data-story-start="text"'));
  assert.ok(app.includes('Create a photo or video story'));
  assert.ok(app.includes('Create a text story'));
  assert.ok(html.includes('/story-workspace.css?v=20261108-facebook-story-workspace-1'));
  assert.ok(css.includes('@media(max-width:560px)'));
});

test('Story privacy page offers every requested audience, custom selection and hide list', async () => {
  const app = await read('../../public/app.js');
  const server = await read('../../src/server.js');
  const policy = await read('../../backend/modules/stories/service.js');
  for (const option of ['public','friends','following','followers','subscribers','custom','hide']) {
    assert.ok(app.includes("['"+option+"'" ) || app.includes('data-story-privacy-choice="'+option+'"'), 'missing privacy choice: '+option);
  }
  assert.ok(app.includes('Who can see your story?'));
  assert.ok(app.includes('Your story will be visible for 24 hours on Minglora and Messenger.'));
  assert.ok(app.includes('Story privacy'));
  assert.ok(app.includes('data-story-privacy-cancel'));
  assert.ok(app.includes('data-story-privacy-save'));
  assert.ok(app.includes('storyCustomUserIds'));
  assert.ok(app.includes('storyHiddenUserIds'));
  assert.ok(server.includes('storyCustomUserIds:[]'));
  assert.ok(server.includes('storyHiddenUserIds:[]'));
  assert.ok(server.includes('if(viewerId!==story.userId&&Array.isArray(story.hiddenUserIds)'));
  assert.ok(policy.includes("story.audience === 'custom'"));
  assert.ok(policy.includes("story.audience === 'subscribers'"));
  assert.ok(policy.includes("story.audience === 'following'"));
});

test('Story audience identifiers are not returned in public story payloads', async () => {
  const server = await read('../../src/server.js');
  assert.ok(server.includes('const {customUserIds,hiddenUserIds,...safeStory}=story;'));
  assert.ok(server.includes('customUserIds,hiddenUserIds'));
  assert.ok(server.includes('if(!await canViewStory(user.id,story))continue;'));
});
