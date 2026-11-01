import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProfilePatch } from '../../src/domain/validation.js';

test('profile About accepts separately structured categories and audience settings',()=>{
  const result=validateProfilePatch({
    aboutSections:{
      personalDetails:{pronouns:'they/them',currentCity:'Kingston',hometown:'Montego Bay',familyMembers:['Sam — parent','Alex — sibling']},
      intro:{bio:'A short introduction.'},
      work:{entries:[{company:'Example Studio',position:'Designer',isCurrent:true}]},
      education:{entries:[{school:'Example University',degree:'BSc',graduationYear:'2024'}]},
      hobbies:{items:['Reading','Photography']},
      interests:{items:['Music','Football']},
      travel:{placesLived:['Kingston, Jamaica'],visited:['Portland, Jamaica'],wantToVisit:['Kyoto, Japan']},
      links:{items:[
        {platform:'Instagram',url:'https://www.instagram.com/example'},
        {platform:'TikTok',url:'https://www.tiktok.com/@example'}
      ]},
      contactInfo:{email:'hello@example.com',phone:'+18765551234',website:'https://example.com'},
      names:{nickname:'Sam',pronunciation:'sam'},
      details:{languages:['English','Spanish'],favoriteQuote:'Keep learning.'},
      aboutYou:{description:'A little more about me.'}
    },
    aboutSectionVisibility:{personalDetails:'friends',intro:'public',links:'public',contactInfo:'private'}
  });
  assert.equal(result.valid,true,result.errors.join(' '));
  assert.equal(result.value.aboutSections.links.items.length,2);
  assert.equal(result.value.aboutSections.personalDetails.familyMembers.length,2);
  assert.equal(result.value.aboutSections.travel.placesLived[0],'Kingston, Jamaica');
  assert.equal(result.value.aboutSections.work.entries[0].isCurrent,true);
  assert.equal(result.value.aboutSectionVisibility.contactInfo,'private');
});

test('profile About rejects unsafe social and website URLs',()=>{
  const result=validateProfilePatch({
    aboutSections:{
      links:{items:[{platform:'Other',url:'javascript:alert(1)'}]},
      contactInfo:{website:'data:text/html,hello'}
    }
  });
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(error=>error.includes('Social link URL')));
  assert.ok(result.errors.some(error=>error.includes('Contact website')));
});

test('profile About rejects unknown sections and invalid visibility levels',()=>{
  const result=validateProfilePatch({
    aboutSections:{secretAdmin:{value:'not allowed'}},
    aboutSectionVisibility:{contactInfo:'everyone'}
  });
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(error=>error.includes('Unsupported About section')));
  assert.ok(result.errors.some(error=>error.includes('Choose Public, Friends or Only me')));
});

test('profile About bounds list size and text length',()=>{
  const result=validateProfilePatch({
    aboutSections:{
      hobbies:{items:Array.from({length:65},(_,index)=>'Hobby '+index)},
      intro:{bio:'x'.repeat(501)}
    }
  });
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(error=>error.includes('up to 60 items')));
  assert.ok(result.errors.some(error=>error.includes('500 characters or fewer')));
});

test('individual About edits may update a single section without replacing other categories',()=>{
  const result=validateProfilePatch({
    aboutSections:{intro:{bio:'Updated intro'}},
    aboutSectionVisibility:{intro:'friends'}
  });
  assert.equal(result.valid,true);
  assert.deepEqual(result.value.aboutSections,{intro:{bio:'Updated intro'}});
  assert.deepEqual(result.value.aboutSectionVisibility,{intro:'friends'});
});
