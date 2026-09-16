# Selected-capture export mapping

The native `.contacthistory` directory is the full-fidelity recovery format. CSV and vCard 3.0 are import-oriented projections. Neither preserves Google resource IDs, revisions, raw metadata, unknown nested fields, or the capture timeline.

CSV headers follow the [current Google Contacts import guidance](https://support.google.com/contacts/answer/15147365?hl=en-GB): names, nickname, birthday, notes, first organization name/title, labels, and repeated email, phone, and structured address columns. Labels resolve historical group names at the chosen capture. CSV does not include photos. The first organization and birthday are mapped; later values and other field families remain only in the native archive.

vCard 3.0 maps formatted/structured name, repeated email, phone, address, organization, title, URL and note, the first birthday, historical categories, and one available historical photo. WebP photos are converted to PNG for vCard only; original bytes remain untouched. Content lines use CRLF and fold at 75 UTF-8 octets. Multiple photos, custom fields, source metadata, events, relations and other People API fields remain only in the native archive. See [RFC 2426](https://www.rfc-editor.org/rfc/rfc2426.html).

Importer compatibility needs a disposable-account round trip before claiming a particular Google Contacts import version is verified.
