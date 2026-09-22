import { describe, expect, test } from 'bun:test';
import { contactsInPrintGroup, printDate, printName, printOrganizations, printRows } from '../src/lib/contact-print';
import type { Contact } from '../src/lib/ipc';
const contact = (id: string, memberships: string[] = []): Contact => ({ resource_name: id, display_name: id, version: 1, payload: { memberships: memberships.map(id => ({ contactGroupMembership: { contactGroupResourceName: id } })) } });
describe('contact printing', () => {
  test('includes label aliases once, excluding unrelated contacts', () => {
    const contacts = [contact('A', ['g1', 'g2']), contact('B', ['g2']), contact('C', ['other'])];
    expect(contactsInPrintGroup(contacts, [{resource_name:'g1', name:'Team', member_count:null}, {resource_name:'g2',name:' team ',member_count:null}], 'g1').map(c => c.resource_name)).toEqual(['A','B']);
  });
  test('retains repeated fields, custom labels and multiline addresses', () => {
    const c = contact('Alex');
    c.payload = { nicknames:[{value:'Al'}], organizations:[{name:'Example Organisation',title:'Designer',department:'Product'}, {name:'Second Organisation'}, {}], emailAddresses:[{value:'one@example.com',type:'home'},{value:'two@example.com',formattedType:'Work'}], addresses:[{streetAddress:'1 Example Road',city:'London'}], userDefined:[{key:'Account',value:'<script>literal</script>'}] };
    expect(printName(c)).toBe('Alex (Al)');
    expect(printOrganizations(c)).toEqual(['Example Organisation · Designer · Product', 'Second Organisation']);
    const rows = printRows(c);
    expect(rows.map(r => r.label)).toEqual(['Email','Address','Custom']);
    expect(rows[0].values).toHaveLength(2);
    expect(rows[1].values[0].text).toBe('1 Example Road\nLondon');
    expect(rows[2].values[0]).toEqual({text:'<script>literal</script>',type:'Account'});
  });
  test('handles yearless leap birthdays and text dates', () => {
    expect(printDate({date:{month:2,day:29}})).toBe('29 February');
    expect(printDate({date:{year:2001,month:2,day:3}})).toBe('3 February 2001');
    expect(printDate({text:'Spring'})).toBe('Spring');
    expect(printRows(contact('Empty'))).toEqual([]);
  });
});
