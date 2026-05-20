# too-many-items

todo:
- fix background gradient, there is a stray bar at top
- remove scrolling for page, only card inside page should be scrollable. Page should look good on all display, agnostic of their ppi and resolution
- add sorting and filtering by category specific specs for example resistance
- in database menu there should be comprehensive statictics with graphs, bars, etc
- remove NAVI references and TOO MANY ITEMS references, as a header use repo owners name
- add comprehensive locations editor to make different kind of storage spaces available. For example i can have individual drawers for components at home, bulk boxes at work etc. This functionality will be reused in LED aided storage solutions, like highlighting drawer with a pcb that is connected to network via some kind of api.
- Bulk add should be more flexible. I may need to add a lot of items with equal quantity or not. Maybe use it as single line editor with an add button under previous item which copies values from previous entry. And configurable bulk adder, i may need to add e96, e24 or other set of values with similar specs other than resistance/capacitance/etc
- also add support for importing kicad default BOM template generated csv files to generate project and adding/removing items needed for that project and redacting BOM after importing. They should be stored in repo, not imported every session.
- make parts page configurable, i may not need to see ID, location or anything else
