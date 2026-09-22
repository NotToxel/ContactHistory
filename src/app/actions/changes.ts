import { api } from '../../lib/ipc';
import type { AppModel } from '../model.svelte';
export async function refreshChanges(
  this: Pick<
    AppModel,
    | 'capture'
    | 'captures'
    | 'changes'
    | 'chosenChange'
    | 'compareBaseSeq'
    | 'compareTargetSeq'
    | 'selected'
  >,
): Promise<void> {
  if (!this.selected || !this.capture) {
    this.changes = [];
    return;
  }
  this.compareTargetSeq = this.capture.sequence;
  const prior = this.captures.find((c) => c.sequence < this.capture!.sequence);
  this.compareBaseSeq = prior ? prior.sequence : this.capture.sequence;
  try {
    if (this.compareBaseSeq === this.compareTargetSeq) {
      this.changes = await api.changes(this.selected.id, this.capture.sequence, 0);
    } else {
      this.changes = await api.compareSnapshots(
        this.selected.id,
        this.compareBaseSeq,
        this.compareTargetSeq,
      );
    }
  } catch (e) {
    this.changes = [];
  }
  this.chosenChange = undefined;
}

export async function refreshChangesComparison(
  this: Pick<
    AppModel,
    | 'busy'
    | 'changes'
    | 'chosenChange'
    | 'compareBaseSeq'
    | 'compareTargetSeq'
    | 'error'
    | 'selected'
  >,
): Promise<void> {
  if (!this.selected || this.compareBaseSeq === null || this.compareTargetSeq === null) {
    this.changes = [];
    return;
  }
  this.busy = true;
  try {
    if (this.compareBaseSeq === this.compareTargetSeq) {
      this.changes = await api.changes(this.selected.id, this.compareTargetSeq, 0);
    } else {
      this.changes = await api.compareSnapshots(
        this.selected.id,
        this.compareBaseSeq,
        this.compareTargetSeq,
      );
    }
  } catch (e) {
    this.changes = [];
    this.error = String(e);
  } finally {
    this.busy = false;
  }
  this.chosenChange = undefined;
}

export async function refreshAllChanges(
  this: Pick<AppModel, 'changelogList' | 'loadingChangelog' | 'selected'>,
): Promise<void> {
  if (!this.selected) {
    this.changelogList = [];
    return;
  }
  this.loadingChangelog = true;
  try {
    this.changelogList = await api.allChanges(this.selected.id, 2000, 0);
  } catch (e) {
    this.changelogList = [];
  } finally {
    this.loadingChangelog = false;
  }
}

export function swapComparisonSnapshots(
  this: Pick<
    AppModel,
    'compareBaseSeq' | 'compareTargetSeq' | 'recordNavigation' | 'refreshChangesComparison'
  >,
): void {
  const temp = this.compareBaseSeq;
  this.compareBaseSeq = this.compareTargetSeq;
  this.compareTargetSeq = temp;
  this.refreshChangesComparison();
  this.recordNavigation();
}

export function compareSnapshotWithPrior(
  this: Pick<
    AppModel,
    | 'captures'
    | 'changesTab'
    | 'compareBaseSeq'
    | 'compareTargetSeq'
    | 'recordNavigation'
    | 'refreshChangesComparison'
  >,
  seq: number,
): void {
  this.compareTargetSeq = seq;
  const prior = this.captures.find((c) => c.sequence < seq);
  this.compareBaseSeq = prior ? prior.sequence : seq;
  this.changesTab = 'comparison';
  this.refreshChangesComparison();
  this.recordNavigation();
}

export function toggleSnapshotCollapse(
  this: Pick<AppModel, 'collapsedSnapshots'>,
  seq: number,
): void {
  const next = new Set(this.collapsedSnapshots);
  if (next.has(seq)) {
    next.delete(seq);
  } else {
    next.add(seq);
  }
  this.collapsedSnapshots = next;
}
