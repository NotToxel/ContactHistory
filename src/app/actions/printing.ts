import { tick } from 'svelte';
import { contactsInPrintGroup } from '../../lib/contact-print';
import { type MissingField } from '../../lib/missing-fields';
import { type Contact } from '../../lib/ipc';
import type { AppModel } from '../model.svelte';
import type { ContactScope } from '../types';
export function changeMissingFields(
  this: Pick<
    AppModel,
    | 'detail'
    | 'missingFieldMode'
    | 'missingFields'
    | 'navigate'
    | 'recordNavigation'
    | 'selectedContactKeys'
    | 'updateDisplayedContacts'
  >,
  fields: MissingField[],
  mode: 'any' | 'all',
): void {
  this.missingFields = fields;
  this.missingFieldMode = mode;
  this.selectedContactKeys = [];
  this.detail = undefined;
  this.navigate('contacts');
  this.updateDisplayedContacts();
  this.recordNavigation();
}

export function prepareScopes(
  this: Pick<
    AppModel,
    | 'allSnapshotContacts'
    | 'contacts'
    | 'groups'
    | 'isFavourite'
    | 'missingFields'
    | 'scopeChoices'
    | 'selectedContactsList'
    | 'selectedGroups'
  >,
  single?: Contact,
): string {
  const choices: ContactScope[] = [];
  if (single) choices.push({ value: 'single', label: 'This contact', contacts: [single] });
  if (this.selectedContactsList.length)
    choices.push({
      value: 'selected',
      label: 'Selected contacts',
      contacts: [...this.selectedContactsList],
    });
  choices.push({ value: 'all', label: 'All contacts', contacts: [...this.allSnapshotContacts] });
  choices.push({
    value: 'favourites',
    label: 'Favourites',
    contacts: this.allSnapshotContacts.filter(this.isFavourite),
  });
  if (this.selectedGroups.length || this.missingFields.length)
    choices.push({ value: 'filtered', label: 'Filtered contacts', contacts: [...this.contacts] });
  for (const group of this.groups)
    choices.push({
      value: group.resource_name,
      label: group.name,
      contacts: contactsInPrintGroup(this.allSnapshotContacts, this.groups, group.resource_name),
    });
  this.scopeChoices = choices.map((choice) => ({
    ...choice,
    label: choice.label + ' (' + choice.contacts.length + ')',
  }));
  return single
    ? 'single'
    : this.selectedContactsList.length
      ? 'selected'
      : this.selectedGroups.length || this.missingFields.length
        ? 'filtered'
        : 'all';
}

export function openPrintDialog(
  this: Pick<AppModel, 'prepareScopes' | 'printScope' | 'showPrintDialog'>,
  single?: Contact,
): void {
  this.printScope = this.prepareScopes(single);
  this.showPrintDialog = true;
}

export async function printChosenContacts(
  this: Pick<
    AppModel,
    'printContacts' | 'printScope' | 'printing' | 'scopeChoices' | 'showPrintDialog'
  >,
): Promise<void> {
  const choice = this.scopeChoices.find((item) => item.value === this.printScope);
  if (!choice?.contacts.length) return;
  this.printing = true;
  try {
    this.printContacts = [...choice.contacts];
    this.showPrintDialog = false;
    await tick();
    await document.fonts.ready;
    window.print();
  } finally {
    this.printing = false;
  }
}
