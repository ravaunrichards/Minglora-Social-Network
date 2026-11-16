export const VIDEO_CHANNEL_POST_MAX_TITLE=100;
export const VIDEO_CHANNEL_POST_MAX_BODY=3000;
export const VIDEO_CHANNEL_POST_MAX_PER_OWNER=500;
export function validateVideoChannelPostInput(input,{partial=false}={}){
 const source=input&&typeof input==="object"&&!Array.isArray(input)?input:{},value={},errors=[];
 if(!partial||Object.hasOwn(source,"title")){const title=String(source.title??"").trim();if(title.length>VIDEO_CHANNEL_POST_MAX_TITLE)errors.push("Channel update titles must be 100 characters or fewer.");else value.title=title;}
 if(!partial||Object.hasOwn(source,"body")){const body=String(source.body??"").trim();if(!body||body.length>VIDEO_CHANNEL_POST_MAX_BODY)errors.push("Channel updates must contain between 1 and 3,000 characters.");else value.body=body;}
 if(partial&&!Object.keys(value).length&&!errors.length)errors.push("Provide a title or message to update.");
 return {valid:errors.length===0,value,errors};
}
export function createVideoChannelPost(posts,{id,ownerId,title="",body,createdAt=new Date().toISOString()}={}){
 if(!Array.isArray(posts)||!id||!ownerId)return {status:"invalid",post:null};
 const validation=validateVideoChannelPostInput({title,body});if(!validation.valid)return {status:"invalid",post:null,errors:validation.errors};
 if(posts.filter(item=>item?.ownerId===ownerId&&item.status!=="deleted").length>=VIDEO_CHANNEL_POST_MAX_PER_OWNER)return {status:"limit",post:null};
 const timestamp=String(createdAt),post={id:String(id),ownerId:String(ownerId),title:validation.value.title,body:validation.value.body,status:"published",createdAt:timestamp,updatedAt:timestamp,deletedAt:null};
 posts.push(post);return {status:"created",post};
}
export function updateVideoChannelPost(posts,{postId,ownerId,input,updatedAt=new Date().toISOString()}={}){
 if(!Array.isArray(posts)||!postId||!ownerId)return {status:"invalid",post:null};
 const post=posts.find(item=>item?.id===postId&&item.ownerId===ownerId&&item.status!=="deleted");if(!post)return {status:"not_found",post:null};
 const validation=validateVideoChannelPostInput(input,{partial:true});if(!validation.valid)return {status:"invalid",post:null,errors:validation.errors};
 Object.assign(post,validation.value,{updatedAt:String(updatedAt)});return {status:"updated",post};
}
export function deleteVideoChannelPost(posts,{postId,ownerId,deletedAt=new Date().toISOString()}={}){
 if(!Array.isArray(posts)||!postId||!ownerId)return {status:"invalid",post:null};
 const post=posts.find(item=>item?.id===postId&&item.ownerId===ownerId&&item.status!=="deleted");if(!post)return {status:"not_found",post:null};
 post.status="deleted";post.deletedAt=String(deletedAt);post.updatedAt=String(deletedAt);return {status:"deleted",post};
}
