const fs = require("fs");

const { LINKED_GROUPS_FILE } = require("../config/paths");
const { IMAGE_SEARCH_GROUP_ID } = require("../config/constants");

let cache = null;

function loadStore() {
    if (cache) return cache;

    if (!fs.existsSync(LINKED_GROUPS_FILE)) {
        cache = { groupIds: [IMAGE_SEARCH_GROUP_ID] };
        saveStore();
        return cache;
    }

    try {
        const data = JSON.parse(fs.readFileSync(LINKED_GROUPS_FILE, "utf-8"));
        const groupIds = Array.isArray(data.groupIds)
            ? data.groupIds.map(String).filter(Boolean)
            : [];
        cache = { groupIds };
    } catch {
        cache = { groupIds: [IMAGE_SEARCH_GROUP_ID] };
        saveStore();
    }

    return cache;
}

function saveStore() {
    fs.writeFileSync(LINKED_GROUPS_FILE, `${JSON.stringify(cache, null, 2)}\n`, "utf-8");
}

function isLinkedGroup(groupId) {
    return loadStore().groupIds.includes(String(groupId));
}

function linkGroup(groupId) {
    const id = String(groupId);
    const store = loadStore();
    if (store.groupIds.includes(id)) return false;
    store.groupIds.push(id);
    saveStore();
    return true;
}

function getLinkedGroups() {
    return [...loadStore().groupIds];
}

module.exports = {
    isLinkedGroup,
    linkGroup,
    getLinkedGroups,
};
