<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import { locationSettingsSystem } from "../../../systems/settings/location";
import { locationSettingsState } from "../../../systems/settings/location/state";

const props = withDefaults(defineProps<{ location?: number }>(), { location: -1 });

const { t } = useI18n();

const { reactive: $, getOption } = locationSettingsState;
const lss = locationSettingsSystem;

const isGlobal = computed(() => props.location < 0);

const location = computed(() => (isGlobal.value ? undefined : props.location));

const useGrid = computed({
    get() {
        return getOption($.useGrid, location.value).value;
    },
    set(useGrid: boolean | undefined) {
        lss.setUseGrid(useGrid, location.value, true);
    },
});

const gridType = computed({
    get() {
        return getOption($.gridType, location.value).value;
    },
    set(gridType: string | undefined) {
        lss.setGridType(gridType, location.value, true);
    },
});

const unitSize = computed({
    get() {
        return getOption($.unitSize, location.value).value;
    },
    set(unitSize: number | undefined) {
        if (unitSize === undefined || unitSize >= 1) lss.setUnitSize(unitSize, location.value, true);
    },
});

const unitSizeUnit = computed({
    get() {
        return getOption($.unitSizeUnit, location.value).value;
    },
    set(unitSizeUnit: string | undefined) {
        lss.setUnitSizeUnit(unitSizeUnit, location.value, true);
    },
});

function o(k: any): boolean {
    return getOption(k, location.value).override !== undefined;
}
</script>

<template>
    <div class="panel restore-panel">
        <div class="spanrow">
            <template v-if="isGlobal">
                <em style="max-width: 40vw">
                    {{ t("game.ui.settings.common.overridden_msg") }}
                </em>
            </template>
            <template v-else>
                <i18n-t keypath="game.ui.settings.common.overridden_highlight_path" tag="span">
                    <span class="overwritten">{{ t("game.ui.settings.common.overridden_highlight") }}</span>
                </i18n-t>
            </template>
        </div>
        <div class="row" :class="{ overwritten: !isGlobal && o($.useGrid) }">
            <label :for="'useGridInput-' + location">{{ t("game.ui.settings.GridSettings.use_grid") }}</label>
            <div>
                <input :id="'useGridInput-' + location" type="checkbox" v-model="useGrid" />
            </div>
            <div
                v-if="!isGlobal && o($.useGrid)"
                @click="useGrid = undefined"
                :title="t('game.ui.settings.common.reset_default')"
            >
                <font-awesome-icon icon="times-circle" />
            </div>
            <div v-else></div>
        </div>
        <div class="row" :class="{ overwritten: !isGlobal && o($.gridType) }">
            <label :for="'gridType-' + location">{{ t("game.ui.settings.GridSettings.grid_type") }}</label>
            <div>
                <select :id="'gridType-' + location" v-model="gridType">
                    <option value="SQUARE">{{ t("game.ui.settings.GridSettings.SQUARE") }}</option>
                    <option value="POINTY_HEX">{{ t("game.ui.settings.GridSettings.POINTY_HEX") }}</option>
                    <option value="FLAT_HEX">{{ t("game.ui.settings.GridSettings.FLAT_HEX") }}</option>
                </select>
            </div>
            <div
                v-if="!isGlobal && o($.gridType)"
                @click="gridType = undefined"
                :title="t('game.ui.settings.common.reset_default')"
            >
                <font-awesome-icon icon="times-circle" />
            </div>
            <div v-else></div>
        </div>
        <div class="row" :class="{ overwritten: !isGlobal && o($.unitSizeUnit) }">
            <div>
                <label :for="'unitSizeUnit-' + location">{{ t("game.ui.settings.GridSettings.size_unit") }}</label>
            </div>
            <div>
                <input :id="'unitSizeUnit-' + location" type="text" v-model="unitSizeUnit" />
            </div>
            <div
                v-if="!isGlobal && o($.unitSizeUnit)"
                @click="unitSizeUnit = undefined"
                :title="t('game.ui.settings.common.reset_default')"
            >
                <font-awesome-icon icon="times-circle" />
            </div>
            <div v-else></div>
        </div>
        <div class="row" :class="{ overwritten: !isGlobal && o($.unitSize) }">
            <div>
                <label :for="'unitSizeInput-' + location">
                    {{ t("game.ui.settings.GridSettings.unit_size_in_UNIT", { unit: unitSizeUnit }) }}
                </label>
            </div>
            <div>
                <input :id="'unitSizeInput-' + location" type="number" step="any" v-model.number="unitSize" />
            </div>
            <div
                v-if="!isGlobal && o($.unitSize)"
                @click="unitSize = undefined"
                :title="t('game.ui.settings.common.reset_default')"
            >
                <font-awesome-icon icon="times-circle" />
            </div>
            <div v-else></div>
        </div>
    </div>
</template>

<style scoped>
/* Force higher specificity without !important abuse */
.panel.restore-panel {
    grid-template-columns: [setting] 1fr [value] auto [restore] 30px [end];
}

.overwritten,
.restore-panel .row.overwritten * {
    color: #7c253e;
    font-weight: bold;
}
</style>
