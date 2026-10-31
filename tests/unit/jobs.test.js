import test from 'node:test';
import assert from 'node:assert/strict';
import { transitionJobApplication, validateJobApplicationInput, validateJobPostingInput } from '../../backend/modules/jobs/service.js';
const job={title:'Senior Customer Support Specialist',companyName:'Minglora Partner Services',description:'Provide high-quality customer support, resolve account questions, document recurring issues and work with product teams to improve service quality.',category:'customer_service',employmentType:'full_time',workplaceType:'hybrid',location:'Kingston, Jamaica',applicationDeadline:'2030-06-30T23:59:00Z',currency:'JMD',salaryMin:'150000.00',salaryMax:'220000.00'};
test('job posting validates employment, workplace, salary and deadline',()=>{
 const result=validateJobPostingInput(job,new Date('2030-01-01T00:00:00Z'));assert.equal(result.valid,true);assert.equal(result.value.salaryMinMinor,15000000);
 assert.equal(validateJobPostingInput({...job,salaryMin:'250000',salaryMax:'100000'},new Date('2030-01-01T00:00:00Z')).valid,false);
 assert.equal(validateJobPostingInput({...job,applicationDeadline:'2029-01-01T00:00:00Z'},new Date('2030-01-01T00:00:00Z')).valid,false);
});
test('job applications require a meaningful cover letter',()=>{
 assert.equal(validateJobApplicationInput({coverLetter:'I am interested in this role and bring relevant experience.'}).valid,true);
 assert.equal(validateJobApplicationInput({coverLetter:'hi'}).valid,false);
});
test('only employers can advance hiring decisions and applicants can withdraw',()=>{
 const application={id:'app1',applicantId:'candidate-1',status:'submitted'},posting={employerId:'employer-1'};
 assert.equal(transitionJobApplication(application,'candidate-1',posting,'shortlisted').valid,false);
 assert.equal(transitionJobApplication(application,'employer-1',posting,'shortlisted').valid,true);
 assert.equal(transitionJobApplication(application,'candidate-1',posting,'withdrawn').valid,true);
 assert.equal(transitionJobApplication(application,'stranger',posting,'rejected').valid,false);
});
