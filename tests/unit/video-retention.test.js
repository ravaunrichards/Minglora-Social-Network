import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeCreatorVideoAnalytics, VIDEO_RETENTION_MIN_SAMPLE_SIZE } from '../../src/domain/video-analytics.js';

const now=Date.parse('2026-11-11T12:00:00.000Z');
const createdAt=new Date(now-60_000).toISOString();
const video={id:'video-1',userId:'creator',text:'Retention test video',createdAt,status:'published'};
const event=(userId,positionMs,extra={})=>({
  id:'event-'+userId,userId,postId:'video-1',watchedMs:4000,durationMs:10_000,
  completed:false,positionMs,createdAt,...extra
});

test('retention curves count distinct viewers at measured playback milestones',()=>{
  const events=[
    event('viewer-a',10_000),
    event('viewer-a',3_000,{id:'event-a-earlier'}),
    event('viewer-b',8_000),
    event('viewer-c',6_000),
    event('viewer-d',4_000),
    event('viewer-e',2_000)
  ];
  const retention=summarizeCreatorVideoAnalytics([video],events,'creator',now,30).videos[0].retention;
  assert.equal(retention.available,true);
  assert.equal(retention.minSampleSize,VIDEO_RETENTION_MIN_SAMPLE_SIZE);
  assert.equal(retention.sampleSize,5);
  assert.deepEqual(retention.points.map(point=>point.positionPercent),[0,25,50,75,90,100]);
  assert.deepEqual(retention.points.map(point=>point.retainedViewers),[5,4,3,2,1,1]);
  assert.deepEqual(retention.points.map(point=>point.retentionRate),[1,0.8,0.6,0.4,0.2,0.2]);
});

test('retention is withheld below five measured viewers while existing legacy watch metrics remain available',()=>{
  const measured=['viewer-a','viewer-b','viewer-c','viewer-d'].map(id=>event(id,5_000));
  const legacy=[event('legacy-e',undefined,{id:'legacy-e'}),event('legacy-f',undefined,{id:'legacy-f'})];
  const row=summarizeCreatorVideoAnalytics([video],[...measured,...legacy],'creator',now,30).videos[0];
  assert.equal(row.uniqueViewers,6);
  assert.equal(row.retention.available,false);
  assert.equal(row.retention.sampleSize,null);
  assert.deepEqual(row.retention.points,[]);
  assert.equal(row.totalWatchSeconds,24);
});

test('invalid playback positions do not enter privacy-sensitive retention samples',()=>{
  const events=[
    event('viewer-a',10_001),
    event('viewer-b',-1),
    event('viewer-c',1_000.5),
    event('viewer-d','5000'),
    event('viewer-e',null)
  ];
  const row=summarizeCreatorVideoAnalytics([video],events,'creator',now,30).videos[0];
  assert.equal(row.uniqueViewers,5);
  assert.equal(row.retention.available,false);
  assert.equal(row.retention.sampleSize,null);
});

test('position telemetry remains optional for existing clients and is accepted by the API and both video players',()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const server=fs.readFileSync(path.join(root,'src/server.js'),'utf8');
  const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'public/creator-video-analytics.css'),'utf8');
  assert.match(server,/input\.positionMs!==undefined&&input\.positionMs!==null/);
  assert.match(server,/recent\.positionMs=Math\.max/);
  assert.match(server,/event\.positionMs=safePositionMs/);
  assert.equal((app.match(/furthestPlayedPositionMs/g)||[]).length>=6,true);
  assert.equal((app.match(/JSON\.stringify\(\{watchedMs,durationMs,positionMs\}\)/g)||[]).length,2);
  assert.match(app,/Audience retention/);
  assert.match(css,/\.creator-video-retention/);
});

test('Creator Studio keeps its existing summary metrics and privacy boundaries',()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const source=fs.readFileSync(path.join(root,'src/domain/video-analytics.js'),'utf8');
  assert.match(source,/viewerIds/===undefined|VIDEO_RETENTION_MIN_SAMPLE_SIZE/);
  assert.match(source,/uniqueVideoViews/);
  assert.match(source,/completionRate/);
});
