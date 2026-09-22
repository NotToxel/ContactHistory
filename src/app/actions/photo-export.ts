import { getContactPhotos } from '../../lib/photos';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { save, open } from '@tauri-apps/plugin-dialog';
import { api, listenPhotoExportProgress, type Contact } from '../../lib/ipc';
import type { AppModel } from '../model.svelte';
export function openPhotoExport(
  this: Pick<
    AppModel,
    | 'capture'
    | 'photoExportBusy'
    | 'photoExportError'
    | 'photoExportProgress'
    | 'photoExportResult'
    | 'photoExportScope'
    | 'prepareScopes'
    | 'selected'
    | 'showPhotoExportModal'
  >,
): void {
  if (!this.selected || !this.capture || this.capture.contact_count === 0) return;
  this.photoExportScope = this.prepareScopes();
  this.showPhotoExportModal = true;
  this.photoExportBusy = false;
  this.photoExportProgress = null;
  this.photoExportResult = null;
  this.photoExportError = '';
}

export function detailPhotoUrl(
  this: Pick<AppModel, 'avatarMap' | 'detail' | 'media' | 'selectedPhotoUrl'>,
): string | null {
  if (!this.detail) return null;
  const photos = getContactPhotos(this.detail, this.media, this.avatarMap);
  const photo = photos.find((item) => item.url === this.selectedPhotoUrl) ?? photos[0];
  if (!photo) return null;
  if (/^https?:\/\//.test(photo.url) || photo.url.startsWith('data:image/')) return photo.url;
  return photo.displayUrl.startsWith('data:image/') ? photo.displayUrl : null;
}

export async function openPhotoQualityMenu(
  this: Pick<
    AppModel,
    | 'capture'
    | 'detailPhotoUrl'
    | 'photoQualityError'
    | 'photoQualityInfo'
    | 'photoQualityLoading'
    | 'photoQualityRequest'
    | 'photoQualitySelection'
    | 'previewSequence'
    | 'selected'
    | 'showPhotoQualityMenu'
  >,
): Promise<void> {
  this.showPhotoQualityMenu = !this.showPhotoQualityMenu;
  if (!this.showPhotoQualityMenu || !this.selected || !this.capture) return;
  const photoUrl = this.detailPhotoUrl();
  if (!photoUrl) return;
  const request = ++this.photoQualityRequest;
  this.photoQualityInfo = null;
  this.photoQualitySelection = null;
  this.photoQualityError = '';
  this.photoQualityLoading = true;
  try {
    const info = await api.singlePhotoQuality(
      this.selected.id,
      this.previewSequence ?? this.capture.sequence,
      photoUrl,
    );
    if (request === this.photoQualityRequest && this.showPhotoQualityMenu) {
      this.photoQualityInfo = info;
      this.photoQualitySelection =
        info.resizable && Math.max(info.width, info.height) >= 512 ? 512 : null;
    }
  } catch (e) {
    if (request === this.photoQualityRequest && this.showPhotoQualityMenu)
      this.photoQualityError = `Could not check available sizes: ${String(e)}`;
  } finally {
    if (request === this.photoQualityRequest) this.photoQualityLoading = false;
  }
}

export async function downloadDetailPhoto(
  this: Pick<
    AppModel,
    | 'capture'
    | 'detail'
    | 'detailPhotoUrl'
    | 'getDisplayName'
    | 'photoDownloadBusy'
    | 'photoQualityError'
    | 'photoQualityInfo'
    | 'photoQualitySelection'
    | 'previewSequence'
    | 'selected'
    | 'showDetailMenu'
    | 'showPhotoQualityMenu'
    | 'toastMessage'
  >,
  preferHigh = false,
): Promise<void> {
  if (!this.detail || !this.selected || !this.capture || this.photoDownloadBusy) return;
  const photoUrl = this.detailPhotoUrl();
  if (!photoUrl) {
    this.toastMessage = 'No photo is available for this contact.';
    return;
  }
  this.photoDownloadBusy = true;
  try {
    const info =
      preferHigh || !this.photoQualityInfo
        ? await api.singlePhotoQuality(
            this.selected.id,
            this.previewSequence ?? this.capture.sequence,
            photoUrl,
          )
        : this.photoQualityInfo;
    const size = preferHigh
      ? info.resizable && Math.max(info.width, info.height) >= 512
        ? 512
        : null
      : this.photoQualitySelection;
    const formatNames: Record<string, string> = {
      jpg: 'JPEG',
      png: 'PNG',
      webp: 'WebP',
      gif: 'GIF',
    };
    const formats = [info.extension, 'jpg', 'png', 'webp'].filter(
      (value, index, all) => all.indexOf(value) === index,
    );
    const name =
      this.getDisplayName(this.detail)
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/[. ]+$/, '') || 'Contact photo';
    const destination = await save({
      defaultPath: `${name}.${info.extension}`,
      title: 'Save Contact Photo',
      filters: formats.map((extension) => ({
        name:
          extension === info.extension
            ? `${formatNames[extension]} (original format)`
            : formatNames[extension],
        extensions: [extension],
      })),
    });
    if (!destination) return;
    const savedPath = await api.exportSinglePhoto(
      this.selected.id,
      this.previewSequence ?? this.capture.sequence,
      photoUrl,
      destination,
      size,
    );
    this.toastMessage = `Photo saved to ${savedPath}`;
    this.showDetailMenu = false;
    this.showPhotoQualityMenu = false;
  } catch (e) {
    const message = `Could not download photo: ${String(e)}`;
    if (this.showPhotoQualityMenu) this.photoQualityError = message;
    else this.toastMessage = message;
  } finally {
    this.photoDownloadBusy = false;
  }
}

export async function startPhotoExport(
  this: Pick<
    AppModel,
    | 'capture'
    | 'photoExportBusy'
    | 'photoExportError'
    | 'photoExportFormat'
    | 'photoExportQuality'
    | 'photoExportImageFormat'
    | 'photoExportProgress'
    | 'photoExportResult'
    | 'photoExportScope'
    | 'scopeChoices'
    | 'selected'
  >,
): Promise<void> {
  if (!this.selected || !this.capture) return;
  this.photoExportBusy = true;
  this.photoExportError = '';
  this.photoExportResult = null;
  this.photoExportProgress = null;
  let unlisten: UnlistenFn | null = null;
  try {
    unlisten = await listenPhotoExportProgress((p) => {
      this.photoExportProgress = p;
    });
    let destination: string | null = null;
    if (this.photoExportFormat === 'folder') {
      const selectedDir = await open({
        directory: true,
        multiple: false,
        title: 'Select Destination Folder for Contact Photos',
      });
      if (typeof selectedDir === 'string') {
        destination = selectedDir;
      }
    } else {
      const selectedFile = await save({
        defaultPath: `contact-photos-${this.selected.email}-capture-${this.capture.sequence}.zip`,
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      });
      if (selectedFile) {
        destination = selectedFile;
      }
    }
    if (!destination) {
      this.photoExportBusy = false;
      if (unlisten) unlisten();
      return;
    }
    const res = await api.exportPhotos(
      this.selected.id,
      this.capture.sequence,
      destination,
      this.photoExportFormat,
      false,
      this.scopeChoices
        .find((choice) => choice.value === this.photoExportScope)
        ?.contacts.map((contact) => contact.resource_name) ?? [],
      this.photoExportQuality,
      this.photoExportImageFormat,
    );
    this.photoExportResult = res;
  } catch (e) {
    this.photoExportError = String(e);
  } finally {
    this.photoExportBusy = false;
    if (unlisten) {
      unlisten();
    }
  }
}
