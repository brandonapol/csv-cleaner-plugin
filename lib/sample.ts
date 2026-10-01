/** Planted problems: BOM, mixed newlines, exact dupe, mojibake, impossible dates, DMY, ambiguous dates. */
export const SAMPLE_CSV =
  "\uFEFF" +
  [
    "name,email,hired,city,notes",
    "Ada Lovelace,ada@analytical.engine,03/04/1843,London,First programmer",
    "Ada Lovelace,ada@analytical.engine,03/04/1843,London,First programmer",
    "Grace Hopper,grace@navy.mil,09/12/1906,New York,Caf\u00C3\u00A9 meeting \u00E2\u20AC\u2122early\u00E2\u20AC\u2122",
    "Alan Turing,alan@bletchley.uk,31/06/1912,Manchester,Invalid day",
    "Katherine Johnson,kj@nasa.gov,26/08/1918,White Sulphur Springs,Forced day-first",
  ].join("\n") +
  "\r\n" +
  [
    "Margaret Hamilton,mh@mit.edu,17/08/1936,Paoli,Software",
    "Grace Hopper,grace@navy.mil,1906-12-09,New York,Already ISO",
    '"Doe, Jane",jane@example.com,2024-02-30,Austin,"Quoted, comma"',
    "Niels Bohr,niels@kbh.dk,07/10/1885,Copenhagen,Ambiguous numeric",
    "  grace hopper ,grace@navy.mil,09/12/1906,new york,caf\u00C3\u00A9 meeting \u00E2\u20AC\u2122early\u00E2\u20AC\u2122",
  ].join("\n") +
  "\n";
