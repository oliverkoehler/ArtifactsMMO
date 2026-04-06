import dotenv from "dotenv";
import {ArtifactsApi, ArtifactsError} from "artifacts-api-client";
import {coords} from "./constants.js";

dotenv.config({
    //path: "../.env"
})

console.log("Starting...")
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

async function dumpSunflowers(quantity) {
    await depositToBank("olli", "copper_ore", quantity)
    const { data} = await api.myCharacters.move("olli", coords.COPPER_ORE)
    return await sleep(data.cooldown.remaining_seconds * 1000)
}

while (true) {
    try {
        const res = await api.myCharacters.gathering("olli")
        const inventory_count = getInventoryCount(res.data.character)
        await sleep(res.data.cooldown.remaining_seconds * 1000)
        if (inventory_count.count >= 100) {
            await dumpSunflowers(inventory_count.count)
        }

    } catch(e) {
        if (e instanceof ArtifactsError) {
            console.error(e.message)
        }
    }
}