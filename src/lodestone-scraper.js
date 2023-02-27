import fetch from 'node-fetch';
import { parse } from 'node-html-parser';
import * as fs from 'fs';

const jobNames = [
    [
        ["PLD", "Paladin"], ["WAR", "Warrior"], ["DRK", "Dark Knight"], ["GNB", "Gunbreaker"],
        ["WHM", "White Mage"], ["SCH", "Scholar"], ["AST", "Astrologian"], ["SGE", "Sage"],
        ["MNK", "Monk"], ["DRG", "Dragoon"], ["NIN", "Ninja"], ["SAM", "Samurai"], ["RPR", "Reaper"],
        ["BRD", "Bard"], ["MCH", "Machinist"], ["DNC", "Dancer"],
        ["BLM", "Black Mage"], ["SMN", "Summoner"], ["RDM", "Red Mage"], ["BLU", "Blue Mage"]
    ],
    [
        ["CRP", "Carpenter"], ["BSM", "Blacksmith"], ["ARM", "Armoer"], ["GSM", "Goldsmith"],
        ["LTW", "Leatherworker"], ["WVR", "Weaver"], ["ALC", "Alchemist"], ["CUL", "Culinarian"]
    ],
    [
        ["MIN", "Miner"], ["BTN", "Botanist"], ["FSH", "Fisher"]
    ]
];

const jobs = { combat: [], crafting: [], gathering: [] };

// Init
Object.keys(jobs).map((category, i) => {
    jobNames[i].forEach(job => {
        jobs[category].push(
            { name: job[1], code: job[0], actions: {} }
        )
    })
});

// Split requests in 10 items long pages and wait 1s before each page request
const pagedRequests = split(jobs.combat);
Promise.allSettled([...pagedRequests.map((p, i) => {
    return new Promise((res) => {
        setTimeout(() => {
            res(Promise.allSettled([...p.map(job => {
                const formattedName = job.name.toLowerCase().replace(/\s/g, "");
                return fetch("https://na.finalfantasyxiv.com/jobguide/" + formattedName)
                .then(res => {
                    // console.log(`Parsing ${res.url}`);
                    return res.text()
                })
                .then(html => {
                    const document = parse(html);
                    const actions = scrapeSkills(document, formattedName);
                    Object.assign(job.actions, actions);
                })
                .catch(err => console.error(err))
            })]))
        }, 1000 * i)
    })
})])
.then(() => {
    console.log("All done!");
    fs.writeFileSync("./jobs.json", JSON.stringify(jobs, null, 2));
});

function split(arr) {
    // Make a copy or splice will overwrite the source!
    const array = [...arr];
  
    let i = 0;
    const output = [];
    while (i < array.length) {
        output.push(array.splice(0, 10));
        i++
    };

    return output
}

function scrapeSkills(d, job) {
    // Node structure isn't preserved 1:1 but thankfully
    // all the important nodes have a convenient id assigned..
    const actions = Array.from(d.querySelectorAll("tr")).filter(node => {
        if (node.id) return node
    });

    // Blue Mage fallback I guess..
    if ( job === "bluemage" ) return [];

    // Init array container
    const skills = {
        pve: { jobActions: [], roleActions: [] }, 
        pvp: { jobActions: [], limitBreak: [], commonActions: [] }
    };
    actions.forEach(action => {
        switch(true) {
            case action.id.startsWith("pve_action"):
                skills.pve.jobActions.push(findElements(action));
                break;
            case action.id.startsWith("tank_action"):
            case action.id.startsWith("healer_action"):
            case action.id.startsWith("melee_action"):
            case action.id.startsWith("prange_action"):
            case action.id.startsWith("mrange_action"):
                skills.pve.roleActions.push(findElements(action));
            case action.id.startsWith("pvp_action"):
                skills.pvp.jobActions.push(findElements(action));
                break;
            case action.id.startsWith("pvplimitbreakaction"):
                skills.pvp.limitBreak.push(findElements(action));
                break;
            case action.id.startsWith("pvpcommmononlyaction"):
                skills.pvp.commonActions.push(findElements(action));
                break;
        }
    });

    return skills

    function findElements(n) {
       
        const payload = {};

        if (n.querySelector(".jobclass")) payload.lvl = n.querySelector(".jobclass").innerText.match(/\d+/)[0];
        if (n.querySelector(".classification")) payload.type = n.querySelector(".classification").innerText;

        payload.name = n.querySelector(".skill p strong").innerText;
        payload.cast = n.querySelector(".cast").innerText;
        payload.recast = n.querySelector(".recast").innerText;
        payload.cost = n.querySelector(".cost").innerText.replace(/-/, "0 MP");
        payload.range = n.querySelector(".distant_range").innerText.match(/(\d+y)/g)[0];
        payload.radius = n.querySelector(".distant_range").innerText.match(/(\d+y)/g)[1];
        payload.desc = n.querySelector(".content").innerHTML.replace(/^[\t\n]+|[\t\n]+$/g, "");

        return payload
    }
}