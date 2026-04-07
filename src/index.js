import dotenv from "dotenv";
import {ArtifactsApi, ArtifactsError} from "artifacts-api-client";
import {coords} from "./constants.js";
import config from "../config.json" with { type: "json" };

dotenv.config({
    //path: "../.env"
})

console.log("Starting.... V0.0.2")
const api = ArtifactsApi.create({
    token: process.env.TOKEN
})

export function sleep(ms) {
    console.log("Waiting for " + ms / 1000 + " seconds.")
    return new Promise(resolve => setTimeout(resolve, ms + 1000));
}


export function getInventoryCount(character) {
    const inv = character.inventory
    let count = 0;

    for (const item of inv) {
        count += item.quantity;
    }

    return {
        max: character.inventory_max_items,
        count
    }
}

export function getCoordsFromConfigItem() {
    const itemCode = config?.item;

    if (!itemCode) {
        throw new Error("config.json enthält keinen item-Wert.");
    }

    const coordKey = itemCode.trim().replaceAll("-", "_").toUpperCase();
    const itemCoords = coords[coordKey];

    if (!itemCoords) {
        throw new Error(`Keine Koordinaten für config.item="${itemCode}" gefunden.`);
    }

    return itemCoords;
}

export async function depositToBank(name, code, quantity) {
    const { data } = await api.myCharacters.move(name, coords.BANK)
    await sleep(data.cooldown.remaining_seconds * 1000)
    console.log(name, code, quantity)
    const res = await api.myCharacters.depositBankItem(name, [{
        code: code,
        quantity: quantity
    }])
    await sleep(res.data.cooldown.remaining_seconds * 1000)
    return getInventoryCount(res.data.character)
}

async function dumpItems(quantity) {
    await depositToBank(config.name, config.item, quantity)
    const { data} = await api.myCharacters.move(config.name, coords.GUDGEON)
    return await sleep(data.cooldown.remaining_seconds * 1000)
}

let running = true;

while (running) {
    try {
        const target_coords = getCoordsFromConfigItem();
        const char = await api.characters.get(config.name)
        if (char.data.x !==target_coords.x || char.data.y !== target_coords.y ) {
            await api.myCharacters.move(config.name, target_coords)
        }
        const res = await api.myCharacters.gathering(config.name);
        const character = res?.data?.character;
        const cooldownSeconds = res?.data?.cooldown?.remaining_seconds ?? 0;

        await sleep(cooldownSeconds * 1000)

        const gudgeonCount = character.inventory.reduce((total, item) => {
            return item.code === config.item ? total + item.quantity : total;
        }, 0);

        const inventoryCount = getInventoryCount(character);

        if (inventoryCount.count >= 30) {
            await dumpItems(gudgeonCount);
        }

        if (cooldownSeconds > 0) {
            await sleep(cooldownSeconds * 1000);
        }
    } catch (e) {
        if (e instanceof ArtifactsError) {
            console.error("ArtifactsError:", e.message);
        } else {
            console.error("Unexpected error:", e);
        }

        await sleep(5000);
    }
}
