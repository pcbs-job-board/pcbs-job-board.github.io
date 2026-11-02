/* Site settings.
   repo: "owner/name" of the GitHub repository that receives missing-part reports.
   Leave empty when hosted on GitHub Pages – it is then worked out from the address
   (https://OWNER.github.io/REPO/). Set it if you open the app from disk and still
   want the report button to go to your repository. */
window.PCBS_CONFIG = {
  repo: "mariusz-przeczek/pcbs-job-board",
  version: "0.9.1",
  // Google Apps Script web app that receives reports (see tools/report-endpoint.gs). Empty = only GitHub / copy.
  reportEndpoint: "https://script.google.com/macros/s/AKfycbwJSdRrb_yY93Eo3BR8Wv-wBvlHlXWeZgj7xD_TBzqhlVpeLLF-q3cmJPsEKqBGHg2Z/exec",
};
