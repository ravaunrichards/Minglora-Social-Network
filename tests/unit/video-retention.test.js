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
  assert.match(source,/export const VIDEO_RETENTION_MIN_SAMPLE_SIZE = 5/);
  assert.match(source,/uniqueVideoViews/);
  assert.match(source,/completionRate/);
});


test('audience demographics include only opted-in viewers and suppress groups smaller than five',()=>{
  const ids=['viewer-a','viewer-b','viewer-c','viewer-d','viewer-e'];
  const events=ids.map(id=>event(id,5000));
  const members=ids.map(id=>({id,country:'Jamaica',settings:{privacy:{shareAudienceDemographics:true}}}));
  const privateIds=['private-a','private-b','private-c','private-d'];
  members.push(...privateIds.map(id=>({id,country:'United States',settings:{privacy:{shareAudienceDemographics:false}}})));
  events.push(...privateIds.map(id=>event(id,5000)));
  const result=summarizeCreatorVideoAnalytics([video],events,'creator',now,30,members).demographics;
  assert.equal(result.available,true);
  assert.deepEqual(result.countries,[{country:'Jamaica',viewers:5}]);
  assert.equal(result.suppressedGroups,false);
  const serialized=JSON.stringify(result);
  for(const id of [...ids,...privateIds])assert.equal(serialized.includes(id),false);
});

test('audience demographic groups below five opted-in viewers are suppressed',()=>{
  const ids=['viewer-a','viewer-b','viewer-c','viewer-d'];
  const members=ids.map(id=>({id,country:'Jamaica',settings:{privacy:{shareAudienceDemographics:true}}}));
  const result=summarizeCreatorVideoAnalytics([video],ids.map(id=>event(id,5000)),'creator',now,30,members).demographics;
  assert.equal(result.available,false);
  assert.equal(result.suppressedGroups,true);
  assert.deepEqual(result.countries,[]);
});

test('demographic aggregation counts distinct opted-in viewers once and ignores missing consent or invalid countries',()=>{
  const ids=['viewer-a','viewer-b','viewer-c','viewer-d','viewer-e'];
  const events=ids.flatMap(id=>[event(id,5000),event(id,6000,{id:'repeat-'+id})]);
  const members=ids.map(id=>({id,country:'Jamaica',settings:{privacy:{shareAudienceDemographics:true}}}));
  members.push(
    {id:'viewer-f',country:'Jamaica',settings:{privacy:{shareAudienceDemographics:false}}},
    {id:'viewer-g',country:'',settings:{privacy:{shareAudienceDemographics:true}}}
  );
  events.push(event('viewer-f',5000),event('viewer-g',5000));
  const result=summarizeCreatorVideoAnalytics([video],events,'creator',now,30,members).demographics;
  assert.deepEqual(result.countries,[{country:'Jamaica',viewers:5}]);
});
