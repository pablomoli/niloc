/**
 * POI Icon Picker
 * A floating panel for selecting Bootstrap icons for Points of Interest.
 * Supports preset icons and custom icon input.
 */
(function () {
    const sizeConfigs = {
        large: {
            panelWidth: 150,
            panelHeight: 160,
            gapClass: "gap-1.5",
            buttonClass: "w-11 h-11",
            iconClass: "text-xl"
        },
        small: {
            panelWidth: 138,
            panelHeight: 136,
            gapClass: "gap-1",
            buttonClass: "w-10 h-10",
            iconClass: "text-lg"
        }
    };

    const state = {
        portal: null,
        panel: null,
        active: null,
        onKey: null,
        onScroll: null,
        onResize: null
    };

    function getPortal() {
        if (state.portal) return state.portal;
        state.portal = document.getElementById("poi-icon-portal");
        return state.portal;
    }

    function clampPosition({ left, top, width, height }) {
        const padding = 8;
        const maxLeft = window.innerWidth - width - padding;
        const maxTop = window.innerHeight - height - padding;
        return {
            left: Math.max(padding, Math.min(left, maxLeft)),
            top: Math.max(padding, Math.min(top, maxTop))
        };
    }

    function positionPanel() {
        if (!state.active || !state.panel) return;
        const { anchorEl, config } = state.active;
        if (!anchorEl || !anchorEl.getBoundingClientRect) {
            closePoiIconPicker();
            return;
        }
        const rect = anchorEl.getBoundingClientRect();
        const width = config.panelWidth;
        const height = config.panelHeight;
        let left = rect.left;
        let top = rect.bottom + 8;

        if (left + width > window.innerWidth - 8) {
            left = rect.right - width;
        }
        if (top + height > window.innerHeight - 8) {
            top = rect.top - height - 8;
        }

        const clamped = clampPosition({ left, top, width, height });
        state.panel.style.left = `${clamped.left}px`;
        state.panel.style.top = `${clamped.top}px`;
        state.panel.style.width = `${width}px`;
    }

    function attachGlobalListeners() {
        state.onKey = (event) => {
            if (event.key === "Escape") {
                closePoiIconPicker();
            }
        };
        state.onScroll = () => {
            positionPanel();
        };
        state.onResize = () => {
            positionPanel();
        };
        window.addEventListener("keydown", state.onKey);
        window.addEventListener("scroll", state.onScroll, true);
        window.addEventListener("resize", state.onResize);
    }

    function detachGlobalListeners() {
        if (state.onKey) window.removeEventListener("keydown", state.onKey);
        if (state.onScroll) window.removeEventListener("scroll", state.onScroll, true);
        if (state.onResize) window.removeEventListener("resize", state.onResize);
        state.onKey = null;
        state.onScroll = null;
        state.onResize = null;
    }

    function renderPortal({ value, onSelect, choices, config }) {
        const portal = getPortal();
        if (!portal) return;
        const baseButtonClass = "rounded-lg flex items-center justify-center hover:bg-base-200 transition-colors";
        const selectedClass = "bg-primary/10 ring-2 ring-primary";
        const panelClass = "fixed bg-base-100 border border-base-300 rounded-lg shadow-xl p-2 z-50";

        const visibleChoices = Array.isArray(choices) ? choices.slice(0, Math.max(choices.length - 1, 0)) : [];
        const buttons = visibleChoices
            .map((icon) => {
                const activeClass = icon === value ? selectedClass : "bg-base-100";
                return `
                    <button
                        type="button"
                        class="${config.buttonClass} ${baseButtonClass} ${activeClass}"
                        data-poi-icon="${icon}"
                    >
                        <i class="bi ${icon} ${config.iconClass}"></i>
                    </button>
                `;
            })
            .join("");

        portal.innerHTML = `
            <div class="fixed inset-0" data-poi-backdrop></div>
            <div class="${panelClass}" data-poi-panel>
                <div class="grid grid-cols-3 ${config.gapClass}">
                    ${buttons}
                    <button
                        type="button"
                        class="${config.buttonClass} ${baseButtonClass} bg-base-100"
                        data-poi-custom-toggle
                    >
                        <span class="text-xl font-semibold leading-none">+</span>
                    </button>
                </div>
                <div class="mt-2 hidden" data-poi-custom-input>
                    <div class="flex items-center gap-2">
                        <input
                            type="text"
                            class="input input-bordered input-sm w-full"
                            placeholder="bi-geo-alt"
                            data-poi-custom-field
                        >
                        <button type="button" class="btn btn-sm btn-primary" data-poi-custom-apply>Apply</button>
                    </div>
                    <div class="text-xs text-gray-500 mt-1">Enter a Bootstrap icon name, e.g. bi-geo-alt</div>
                </div>
            </div>
        `;
        portal.classList.remove("hidden");
        state.panel = portal.querySelector("[data-poi-panel]");

        const backdrop = portal.querySelector("[data-poi-backdrop]");
        if (backdrop) {
            backdrop.addEventListener("click", closePoiIconPicker);
        }

        portal.querySelectorAll("[data-poi-icon]").forEach((button) => {
            button.addEventListener("click", () => {
                const icon = button.getAttribute("data-poi-icon");
                if (onSelect) onSelect(icon);
                closePoiIconPicker();
            });
        });

        const customToggle = portal.querySelector("[data-poi-custom-toggle]");
        const customInputWrap = portal.querySelector("[data-poi-custom-input]");
        const customField = portal.querySelector("[data-poi-custom-field]");
        const customApply = portal.querySelector("[data-poi-custom-apply]");

        function applyCustomIcon() {
            if (!customField) return;
            let icon = (customField.value || "").trim();
            if (!icon) return;
            if (!icon.startsWith("bi-")) {
                icon = `bi-${icon}`;
            }
            // Validate icon name to prevent XSS via class attribute injection
            const ICON_REGEX = /^bi-[a-z0-9-]+$/i;
            if (!ICON_REGEX.test(icon)) {
                alert("Invalid icon name. Use only letters, numbers, and hyphens.");
                return;
            }
            if (onSelect) onSelect(icon);
            closePoiIconPicker();
        }

        if (customToggle && customInputWrap) {
            customToggle.addEventListener("click", () => {
                customInputWrap.classList.toggle("hidden");
                if (!customInputWrap.classList.contains("hidden") && customField) {
                    customField.focus();
                    customField.select();
                }
            });
        }

        if (customField) {
            customField.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    applyCustomIcon();
                }
            });
        }

        if (customApply) {
            customApply.addEventListener("click", applyCustomIcon);
        }
    }

    function openPoiIconPicker({ anchorEl, value, onSelect, choices, size }) {
        if (!anchorEl) return;
        if (!Array.isArray(choices) || choices.length === 0) return;
        closePoiIconPicker();
        const config = sizeConfigs[size] || sizeConfigs.large;
        state.active = { anchorEl, value, onSelect, choices, config };
        renderPortal({ value, onSelect, choices, config });
        positionPanel();
        attachGlobalListeners();
    }

    function closePoiIconPicker() {
        const portal = getPortal();
        if (!portal) return;
        portal.classList.add("hidden");
        portal.innerHTML = "";
        state.panel = null;
        state.active = null;
        detachGlobalListeners();
    }

    window.openPoiIconPicker = openPoiIconPicker;
    window.closePoiIconPicker = closePoiIconPicker;
})();
