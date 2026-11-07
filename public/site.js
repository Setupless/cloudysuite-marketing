const APPS = ["mail", "calendar", "storage", "account"];

const DEFAULT_DOMAIN = "example.com";

function normaliseDomain(raw) {
  const domain = raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/^.*@/, "")
    .replace(/:\d*$/, "")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/^www\./, "")
    .replace(/\.+$/, "");
  return domain.slice(0, 63) || DEFAULT_DOMAIN;
}

const domainInput = document.getElementById("domain");
const domainSlots = document.querySelectorAll("[data-domain]");

function showDomain() {
  const domain = normaliseDomain(domainInput.value);
  for (const slot of domainSlots) slot.textContent = domain;
}

domainInput.addEventListener("input", showDomain);
showDomain();

const tabs = APPS.map((app) => document.getElementById(`tab-${app}`));
const panels = APPS.map((app) => document.getElementById(`panel-${app}`));
let selected = APPS[0];

function select(id) {
  selected = id;
  APPS.forEach((app, index) => {
    const isSelected = app === selected;
    tabs[index].setAttribute("aria-selected", String(isSelected));
    tabs[index].tabIndex = isSelected ? 0 : -1;
    panels[index].hidden = !isSelected;
  });
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => select(APPS[index]));
});

tabs[0].parentElement.addEventListener("keydown", (event) => {
  const current = APPS.indexOf(selected);
  const next = {
    ArrowRight: (current + 1) % APPS.length,
    ArrowLeft: (current - 1 + APPS.length) % APPS.length,
    Home: 0,
    End: APPS.length - 1,
  }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  select(APPS[next]);
  tabs[next].focus();
});

for (const panel of panels) panel.tabIndex = 0;
select(selected);
