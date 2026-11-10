'use strict';
const {fail}=require('./orders-planning');
function contactDetails(value){
 if(value===undefined)return {};
 if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'INVALID_INPUT','Contact must be an object');
 const result={},limits={person:160,phone:50,email:254,city:120,address:1000};
 for(const [key,max]of Object.entries(limits)){const text=value[key]??'';if(typeof text!=='string'||text.length>max)fail(400,'INVALID_INPUT','Invalid contact '+key);result[key]=text.trim()}
 if(result.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))fail(400,'INVALID_INPUT','Invalid email');
 return result;
}
module.exports={contactDetails};
