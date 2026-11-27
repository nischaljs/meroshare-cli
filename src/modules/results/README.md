# modules/results

`ipo result`: logs in to each account (paced), reads `POST /meroShare/applicantForm/active/search/` (`VIEW_APPLICANT_FORM_COMPLETE`) and each form's detail (`GET /meroShare/applicantForm/report/detail/{id}`) for the received kitta. Received kitta above zero means allotted. Read only. Sends a `resultOut` notice and offers to open the public result site.
