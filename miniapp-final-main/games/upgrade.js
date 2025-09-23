import { STATE } from '../state.js';
import { UI, showNotification, renderInventory } from '../ui.js';
import * as api from '../api.js';

let onUpgradeCompleteCallback = null;

export function initUpgrade(onComplete) {
    onUpgradeCompleteCallback = onComplete;
    if (UI.performUpgradeBtn) UI.performUpgradeBtn.addEventListener('click', handleUpgradeClick);
    
    if (UI.pickerTabs) {
        UI.pickerTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                if (STATE.upgradeState.isUpgrading) return;
                UI.pickerTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                STATE.upgradeState.activePicker = tab.dataset.picker;
                
                UI.yourItemSlot?.classList.toggle('active-selection', STATE.upgradeState.activePicker === 'inventory');
                UI.desiredItemSlot?.classList.toggle('active-selection', STATE.upgradeState.activePicker === 'desired');
                
                renderItemPicker();
            });
        });
    }

    if (UI.yourItemSlot) UI.yourItemSlot.addEventListener('click', () => !STATE.upgradeState.isUpgrading && UI.pickerTabs[0]?.click());
    if (UI.desiredItemSlot) UI.desiredItemSlot.addEventListener('click', () => !STATE.upgradeState.isUpgrading && UI.pickerTabs[1]?.click());
}

// ... (функции resetUpgradeState, calculateUpgradeChance, renderUpgradeUI, renderItemPicker, handleItemPick остаются без изменений)
export function resetUpgradeState(resetRotation = false) {
    if (!UI.upgradePointer) return;
    Object.assign(STATE.upgradeState, {
        yourItem: null,
        desiredItem: null,
        isUpgrading: false,
    });
    if (resetRotation) {
        STATE.upgradeState.currentRotation = 0;
        UI.upgradePointer.style.transition = 'none';
        UI.upgradePointer.style.transform = `translateX(-50%) rotate(0deg)`;
    }
    calculateUpgradeChance();
    renderUpgradeUI();
    renderItemPicker();
}

function calculateUpgradeChance() {
    const { yourItem, desiredItem, maxChance } = STATE.upgradeState;
    if (!yourItem || !desiredItem) {
        STATE.upgradeState.chance = 0;
        STATE.upgradeState.multiplier = 0;
        return;
    }
    if (desiredItem.value <= yourItem.value) {
        STATE.upgradeState.chance = maxChance;
        STATE.upgradeState.multiplier = desiredItem.value / yourItem.value;
        return;
    }
    const chance = (yourItem.value / desiredItem.value) * (maxChance / 100) * 100;
    STATE.upgradeState.chance = Math.min(chance, maxChance);
    STATE.upgradeState.multiplier = desiredItem.value / yourItem.value;
}

function renderUpgradeUI() {
    if (!UI.yourItemSlot) return;
    const { yourItem, desiredItem, chance, multiplier, isUpgrading } = STATE.upgradeState;

    function updateSlot(slot, item) {
        const placeholder = slot.querySelector('.slot-placeholder');
        const content = slot.querySelector('.slot-content');
        if (item) {
            placeholder.classList.add('hidden');
            content.classList.remove('hidden');
            content.querySelector('img').src = item.imageSrc;
            content.querySelector('img').alt = item.name;
            content.querySelector('span').textContent = item.name;
        } else {
            placeholder.classList.remove('hidden');
            content.classList.add('hidden');
        }
    }

    updateSlot(UI.yourItemSlot, yourItem);
    updateSlot(UI.desiredItemSlot, desiredItem);

    UI.upgradeChanceDisplay.textContent = `${chance.toFixed(2)}%`;
    UI.upgradeMultiplierDisplay.textContent = `x${multiplier.toFixed(2)}`;

    const angle = (chance / 100) * 360;
    UI.upgradeWheel.style.backgroundImage = `conic-gradient(var(--accent-color) ${angle}deg, var(--card-bg-color) ${angle}deg)`;
    
    UI.performUpgradeBtn.disabled = !yourItem || !desiredItem || isUpgrading;
}

function renderItemPicker() {
    if (!UI.itemPickerContent) return;
    UI.itemPickerContent.innerHTML = '';
    const { activePicker, yourItem, desiredItem } = STATE.upgradeState;
    
    const sourceList = activePicker === 'inventory' ? STATE.inventory : STATE.possibleItems;

    if (sourceList.length === 0) {
        UI.itemPickerContent.innerHTML = `<p class="picker-empty-msg">Список пуст</p>`;
        return;
    }

    sourceList.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'picker-item';
        itemEl.innerHTML = `<img src="${item.imageSrc}" alt="${item.name}"><div class="picker-item-name">${item.name}</div><div class="picker-item-value">⭐ ${item.value.toLocaleString('ru-RU')}</div>`;
        
        const isSelectedForYour = yourItem && item.uniqueId && yourItem.uniqueId === item.uniqueId;
        const isSelectedForDesired = desiredItem && desiredItem.id === item.id;
        if (isSelectedForYour || isSelectedForDesired) {
            itemEl.classList.add('selected');
        }

        itemEl.addEventListener('click', () => handleItemPick(item));
        UI.itemPickerContent.appendChild(itemEl);
    });
}

function handleItemPick(item) {
    if (STATE.upgradeState.isUpgrading) return;
    const { activePicker } = STATE.upgradeState;
    if (activePicker === 'inventory') {
        STATE.upgradeState.yourItem = { ...item };
    } else {
        STATE.upgradeState.desiredItem = { ...item };
    }
    calculateUpgradeChance();
    renderUpgradeUI();
    renderItemPicker();
}


async function handleUpgradeClick() {
    const { yourItem, desiredItem, chance, isUpgrading } = STATE.upgradeState;
    if (!yourItem || !desiredItem || isUpgrading) return;
    
    STATE.upgradeState.isUpgrading = true;
    UI.performUpgradeBtn.disabled = true;

    try {
        const result = await api.performUpgrade(yourItem.uniqueId, desiredItem.id);

        const chanceAngle = (chance / 100) * 360;
        const randomOffset = Math.random() * 0.9 + 0.05;
        const stopPoint = result.isSuccess ? chanceAngle * randomOffset : chanceAngle + (360 - chanceAngle) * randomOffset;
        const rotation = (5 * 360) + stopPoint;
        STATE.upgradeState.currentRotation = rotation;

        UI.upgradePointer.style.transition = 'transform 6s cubic-bezier(0.2, 0.8, 0.2, 1)';
        UI.upgradePointer.style.transform = `translateX(-50%) rotate(${STATE.upgradeState.currentRotation}deg)`;

        UI.upgradePointer.addEventListener('transitionend', async () => {
            setTimeout(async () => {
                if (result.isSuccess) {
                    showNotification(`Апгрейд успешный! Вы получили ${result.newItem.name}.`);
                    STATE.gameHistory.push({ ...result.newItem, date: new Date(), name: `Апгрейд до ${result.newItem.name}`, value: result.newItem.value });
                } else {
                    showNotification(`К сожалению, апгрейд не удался. Предмет потерян.`);
                    STATE.gameHistory.push({ ...yourItem, date: new Date(), name: `Неудачный апгрейд ${yourItem.name}`, value: -yourItem.value });
                }
                
                resetUpgradeState(true);

                if (onUpgradeCompleteCallback) {
                    await onUpgradeCompleteCallback();
                }
            }, 1500);
        }, { once: true });

    } catch (error) {
        console.error("Ошибка при апгрейде:", error);
        STATE.upgradeState.isUpgrading = false;
        UI.performUpgradeBtn.disabled = false;
    }
}
