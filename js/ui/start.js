/* Start-up: everything is loaded – build the parts index, draw the board, show the screen and career state. */
if (!window.PARTS_DB) toast("parts-db.js not found next to this page – part suggestions limited to names you've typed.");
buildIndex();
initAutocomplete();
render();
setStatus();
showCareer();
