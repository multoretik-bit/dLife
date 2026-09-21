import {test} from 'node:test';import assert from 'node:assert/strict';import {getLifeState} from '../dist/life.js';
test('birth date is the first calendar day',()=>assert.equal(getLifeState(new Date('2004-09-13T17:00:00Z')).day,1));
test('calendar rollover follows Krasnoyarsk, not UTC',()=>{assert.equal(getLifeState(new Date('2026-09-20T16:59:59Z')).day+1,getLifeState(new Date('2026-09-20T17:00:00Z')).day)});
test('leap day is included',()=>{assert.equal(getLifeState(new Date('2024-03-01T00:00:00Z')).day-getLifeState(new Date('2024-02-28T00:00:00Z')).day,2)});
test('greeting changes at all boundaries',()=>{for(const [hour,text] of [[0,'Доброй ночи'],[5,'Доброе утро'],[12,'Доброго дня'],[18,'Доброго вечера'],[23,'Доброй ночи']])assert.equal(getLifeState(new Date(`2026-09-21T${String(hour).padStart(2,'0')}:00:00+07:00`)).greeting,text)});
