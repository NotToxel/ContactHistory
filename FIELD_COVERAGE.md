# People API field coverage (v1)

Source: `people.connections.list` with the default contact and profile sources. Every returned `Person` object is stored as raw JSON for every successful full scan. The semantic revision copy excludes transport etags, source update times and temporary photo URLs, and sorts arrays for comparison. The UI currently displays the raw object for a selected capture.

Requested `personFields`:

`addresses,ageRanges,biographies,birthdays,calendarUrls,clientData,coverPhotos,emailAddresses,events,externalIds,genders,imClients,interests,locales,locations,memberships,metadata,miscKeywords,names,nicknames,occupations,organizations,phoneNumbers,photos,relations,sipAddresses,skills,urls,userDefined`

All requested fields retain complete arrays and nested metadata in raw observations. Names supply the list display label; no primary-only field replaces source data. Contact groups are scanned separately with `clientData,groupType,memberCount,metadata,name`.

Returned photo and cover photo references are archived when served from an allowed Google image host. Exact bytes are retained; generated/default images are marked separately. Failed retrieval leaves text available and enters a bounded retry queue. Later retrieval is separately timestamped. Other Contacts and Workspace directory records are outside this API source. Periodic observations cannot reconstruct edits between captures. See [export mapping](EXPORT_MAPPING.md) for projection support.

References: [People connections](https://developers.google.com/people/api/rest/v1/people.connections/list), [Contact groups](https://developers.google.com/people/api/rest/v1/contactGroups/list).
