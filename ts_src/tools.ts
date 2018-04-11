import { getUnitDistance, l2g, g2l, g2lr, g2lz, g2lx, g2ly, l2gy, l2gx } from "./units";
import gameManager from "./planarally";
import socket from "./socket";
import { getMouse } from "./utils";
import { Vector, LocalPoint, GlobalPoint } from "./geom";
import { InitiativeData } from "./api_types";
import Rect from "./shapes/rect";
import BaseRect from "./shapes/baserect";
import Line from "./shapes/line";
import Text from "./shapes/text";
import { Layer } from "./layers";
import Shape from "./shapes/shape";

export abstract class Tool {
    detailDiv?: JQuery<HTMLElement>;
    abstract onMouseDown(e: MouseEvent): void;
    abstract onMouseMove(e: MouseEvent): void;
    abstract onMouseUp(e: MouseEvent): void;
    onContextMenu(e: MouseEvent) { };
}

enum SelectOperations {
    Noop,
    Resize,
    Drag,
    GroupSelect,
}

export class SelectTool extends Tool {
    mode: SelectOperations = SelectOperations.Noop;
    resizedir: string = "";
    // Because we never drag from the asset's (0, 0) coord and want a smoother drag experience
    // we keep track of the actual offset within the asset.
    drag: Vector<LocalPoint> = new Vector<LocalPoint>({ x: 0, y: 0 }, new LocalPoint(0, 0));
    selectionStartPoint: GlobalPoint = new GlobalPoint(-1000, -1000);
    selectionHelper: Rect = new Rect(this.selectionStartPoint, 0, 0);
    constructor() {
        super();
        this.selectionHelper.owners.push(gameManager.username);
    }
    onMouseDown(e: MouseEvent): void {
        if (gameManager.layerManager.getLayer() === undefined) {
            console.log("No active layer!");
            return;
        }
        const layer = gameManager.layerManager.getLayer()!;
        const mouse = getMouse(e);

        let hit = false;
        // the selectionStack allows for lower positioned objects that are selected to have precedence during overlap.
        let selectionStack;
        if (!layer.selection.length)
            selectionStack = layer.shapes;
        else
            selectionStack = layer.shapes.concat(layer.selection);
        for (let i = selectionStack.length - 1; i >= 0; i--) {
            const shape = selectionStack[i];
            const corn = shape.getCorner(l2g(mouse));
            if (corn !== undefined) {
                if (!shape.ownedBy()) continue;
                layer.selection = [shape];
                shape.onSelection();
                this.mode = SelectOperations.Resize;
                this.resizedir = corn;
                layer.invalidate(true);
                hit = true;
                break;
            } else if (shape.contains(l2g(mouse))) {
                if (!shape.ownedBy()) continue;
                const sel = shape;
                const z = gameManager.layerManager.zoomFactor;
                if (layer.selection.indexOf(sel) === -1) {
                    layer.selection = [sel];
                    sel.onSelection();
                }
                this.mode = SelectOperations.Drag;
                this.drag = mouse.subtract(g2l(sel.refPoint));
                // this.drag.origin = g2l(sel.refPoint);
                // this.drag.direction = mouse.subtract(this.drag.origin);
                layer.invalidate(true);
                hit = true;
                break;
            }
        }

        if (!hit) {
            layer.selection.forEach(function (sel) {
                sel.onSelectionLoss();
            });
            this.mode = SelectOperations.GroupSelect;
            this.selectionStartPoint = l2g(getMouse(e));
            this.selectionHelper.refPoint = this.selectionStartPoint;
            this.selectionHelper.w = 0;
            this.selectionHelper.h = 0;
            layer.selection = [this.selectionHelper];
            layer.invalidate(true);
        }
    };
    onMouseMove(e: MouseEvent): void {
        if (gameManager.layerManager.getLayer() === undefined) {
            console.log("No active layer!");
            return;
        }
        const layer = gameManager.layerManager.getLayer()!;
        const mouse = getMouse(e);
        const z = gameManager.layerManager.zoomFactor;
        if (this.mode === SelectOperations.GroupSelect) {
            // Currently draw on active this
            const endPoint = l2g(mouse);

            this.selectionHelper.w = Math.abs(endPoint.x - this.selectionStartPoint.x);
            this.selectionHelper.h = Math.abs(endPoint.y - this.selectionStartPoint.y);
            this.selectionHelper.refPoint = new GlobalPoint(
                Math.min(this.selectionStartPoint.x, endPoint.x),
                Math.min(this.selectionStartPoint.y, endPoint.y)
            );
            layer.invalidate(true);
        } else if (layer.selection.length) {
            const og = g2l(layer.selection[layer.selection.length - 1].refPoint);
            let delta = l2g(mouse.subtract(og.add(this.drag)));
            if (this.mode === SelectOperations.Drag) {
                // If we are on the tokens layer do a movement block check.
                if (layer.name === 'tokens') {
                    for (let i = 0; i < layer.selection.length; i++) {
                        const sel = layer.selection[i];
                        if (sel.uuid === this.selectionHelper.uuid) continue; // the selection helper should not be treated as a real shape.
                        delta = calculateDelta(delta, sel);
                    }
                }
                // Actually apply the delta on all shapes
                for (let i = 0; i < layer.selection.length; i++) {
                    const sel = layer.selection[i];
                    sel.refPoint = sel.refPoint.add(delta);
                    if (sel !== this.selectionHelper) {
                        socket.emit("shapeMove", { shape: sel.asDict(), temporary: true });
                    }
                }
                layer.invalidate(false);
            } else if (this.mode === SelectOperations.Resize) {
                for (let i = 0; i < layer.selection.length; i++) {
                    const sel = layer.selection[i];
                    if (!(sel instanceof BaseRect)) return; // TODO
                    // TODO: This has to be shape specific
                    if (this.resizedir === 'nw') {
                        sel.w = g2lx(sel.refPoint.x) + sel.w * z - mouse.x;
                        sel.h = g2ly(sel.refPoint.y) + sel.h * z - mouse.y;
                        sel.refPoint = l2g(mouse);
                    } else if (this.resizedir === 'ne') {
                        sel.w = mouse.x - g2lx(sel.refPoint.x);
                        sel.h = g2ly(sel.refPoint.y) + sel.h * z - mouse.y;
                        sel.refPoint.y = l2gy(mouse.y);
                    } else if (this.resizedir === 'se') {
                        sel.w = mouse.x - g2lx(sel.refPoint.x);
                        sel.h = mouse.y - g2ly(sel.refPoint.y);
                    } else if (this.resizedir === 'sw') {
                        sel.w = g2lx(sel.refPoint.x) + sel.w * z - mouse.x;
                        sel.h = mouse.y - g2ly(sel.refPoint.y);
                        sel.refPoint.x = l2gx(mouse.x);
                    }
                    sel.w /= z;
                    sel.h /= z;
                    if (sel !== this.selectionHelper) {
                        socket.emit("shapeMove", { shape: sel.asDict(), temporary: true });
                    }
                    layer.invalidate(false);
                }
            } else {
                for (let i = 0; i < layer.selection.length; i++) {
                    const sel = layer.selection[i];
                    if (!(sel instanceof BaseRect)) return; // TODO
                    const gm = l2g(mouse);
                    if (sel.inCorner(gm, "nw")) {
                        document.body.style.cursor = "nw-resize";
                    } else if (sel.inCorner(gm, "ne")) {
                        document.body.style.cursor = "ne-resize";
                    } else if (sel.inCorner(gm, "se")) {
                        document.body.style.cursor = "se-resize";
                    } else if (sel.inCorner(gm, "sw")) {
                        document.body.style.cursor = "sw-resize";
                    } else {
                        document.body.style.cursor = "default";
                    }
                }
            };
        } else {
            document.body.style.cursor = "default";
        }
    };
    onMouseUp(e: MouseEvent): void {
        if (gameManager.layerManager.getLayer() === undefined) {
            console.log("No active layer!");
            return;
        }
        const layer = gameManager.layerManager.getLayer()!;
        const mouse = getMouse(e);
        if (this.mode === SelectOperations.GroupSelect) {
            layer.selection = [];
            layer.shapes.forEach((shape) => {
                if (shape === this.selectionHelper) return;
                const bbox = shape.getBoundingBox();
                if (!shape.ownedBy()) return;
                if (this.selectionHelper!.refPoint.x <= bbox.refPoint.x + bbox.w &&
                    this.selectionHelper!.refPoint.x + this.selectionHelper!.w >= bbox.refPoint.x &&
                    this.selectionHelper!.refPoint.y <= bbox.refPoint.y + bbox.h &&
                    this.selectionHelper!.refPoint.y + this.selectionHelper!.h >= bbox.refPoint.y) {
                    layer.selection.push(shape);
                }
            });

            // Push the selection helper as the last element of the selection
            // This makes sure that it will be the first one to be hit in the hit detection onMouseDown
            if (layer.selection.length > 0)
                layer.selection.push(this.selectionHelper);

            layer.invalidate(true);
        } else if (layer.selection.length) {
            layer.selection.forEach((sel) => {
                if (!(sel instanceof BaseRect)) return; // TODO
                if (this.mode === SelectOperations.Drag) {
                    if (this.drag.origin!.x === g2lx(sel.refPoint.x) && this.drag.origin!.y === g2ly(sel.refPoint.y)) { return }
                    if (gameManager.layerManager.useGrid && !e.altKey) {
                        const gs = gameManager.layerManager.gridSize;
                        const mouse = sel.center();
                        const mx = mouse.x;
                        const my = mouse.y;
                        if ((sel.w / gs) % 2 === 0) {
                            sel.refPoint.x = Math.round(mx / gs) * gs - sel.w / 2;
                        } else {
                            sel.refPoint.x = (Math.round((mx + (gs / 2)) / gs) - (1 / 2)) * gs - sel.w / 2;
                        }
                        if ((sel.h / gs) % 2 === 0) {
                            sel.refPoint.y = Math.round(my / gs) * gs - sel.h / 2;
                        } else {
                            sel.refPoint.y = (Math.round((my + (gs / 2)) / gs) - (1 / 2)) * gs - sel.h / 2;
                        }
                    }

                    if (sel !== this.selectionHelper) {
                        socket.emit("shapeMove", { shape: sel.asDict(), temporary: false });
                    }
                    layer.invalidate(false);
                }
                if (this.mode === SelectOperations.Resize) {
                    if (sel.w < 0) {
                        sel.refPoint.x += sel.w;
                        sel.w = Math.abs(sel.w);
                    }
                    if (sel.h < 0) {
                        sel.refPoint.y += sel.h;
                        sel.h = Math.abs(sel.h);
                    }
                    if (gameManager.layerManager.useGrid && !e.altKey) {
                        const gs = gameManager.layerManager.gridSize;
                        sel.refPoint.x = Math.round(sel.refPoint.x / gs) * gs;
                        sel.refPoint.y = Math.round(sel.refPoint.y / gs) * gs;
                        sel.w = Math.max(Math.round(sel.w / gs) * gs, gs);
                        sel.h = Math.max(Math.round(sel.h / gs) * gs, gs);
                    }
                    if (sel !== this.selectionHelper) {
                        socket.emit("shapeMove", { shape: sel.asDict(), temporary: false });
                    }
                    layer.invalidate(false);
                }
            });
        }
        this.mode = SelectOperations.Noop
    };
    onContextMenu(e: MouseEvent) {
        if (gameManager.layerManager.getLayer() === undefined) {
            console.log("No active layer!");
            return;
        }
        const layer = gameManager.layerManager.getLayer()!;
        const mouse = getMouse(e);
        const mx = mouse.x;
        const my = mouse.y;
        let hit = false;
        layer.shapes.forEach(function (shape) {
            if (!hit && shape.contains(l2g(mouse))) {
                shape.showContextMenu(mouse);
            }
        });
    };
}

export class PanTool extends Tool {
    panStart = new LocalPoint(0, 0);
    active: boolean = false;
    onMouseDown(e: MouseEvent): void {
        this.panStart = getMouse(e);
        this.active = true;
    };
    onMouseMove(e: MouseEvent): void {
        if (!this.active) return;
        const mouse = getMouse(e);
        const z = gameManager.layerManager.zoomFactor;
        const distance = l2g(mouse.subtract(this.panStart)).direction;
        gameManager.layerManager.panX += Math.round(distance.x);
        gameManager.layerManager.panY += Math.round(distance.y);
        this.panStart = mouse;
        gameManager.layerManager.invalidate();
    };
    onMouseUp(e: MouseEvent): void {
        this.active = false;
        socket.emit("set clientOptions", {
            locationOptions: {
                [`${gameManager.roomName}/${gameManager.roomCreator}/${gameManager.locationName}`]: {
                    panX: gameManager.layerManager.panX,
                    panY: gameManager.layerManager.panY
                }
            }
        });
    };
    onContextMenu(e: MouseEvent) { };
}

export function setupTools(): void {
    const toolselectDiv = $("#toolselect").find("ul");
    tools.forEach(function (tool) {
        if (!tool.playerTool && !gameManager.IS_DM) return;

        const toolInstance = new tool.clz();
        gameManager.tools.set(tool.name, toolInstance);
        const extra = tool.defaultSelect ? " class='tool-selected'" : "";
        const toolLi = $("<li id='tool-" + tool.name + "'" + extra + "><a href='#'>" + tool.name + "</a></li>");
        toolselectDiv.append(toolLi);
        if (tool.hasDetail) {
            const div = toolInstance.detailDiv!;
            $('#tooldetail').append(div);
            div.hide();
        }
        toolLi.on("click", function () {
            const index = tools.indexOf(tool);
            if (index !== gameManager.selectedTool) {
                $('.tool-selected').removeClass("tool-selected");
                $(this).addClass("tool-selected");
                gameManager.selectedTool = index;
                const detail = $('#tooldetail');
                if (tool.hasDetail) {
                    $('#tooldetail').children().hide();
                    toolInstance.detailDiv!.show();
                    detail.show();
                } else {
                    detail.hide();
                }
            }
        });
    });
}

export class DrawTool extends Tool {
    active: boolean = false;
    startPoint!: GlobalPoint;
    rect!: Rect;
    fillColor = $("<input type='text' />");
    borderColor = $("<input type='text' />");
    detailDiv = $("<div>")
        .append($("<div>Fill</div>")).append(this.fillColor)
        .append($("<div>Border</div>")).append(this.borderColor)
        .append($("</div>"));

    constructor() {
        super();
        this.fillColor.spectrum({
            showInput: true,
            allowEmpty: true,
            showAlpha: true,
            color: "red"
        });
        this.borderColor.spectrum({
            showInput: true,
            allowEmpty: true,
            showAlpha: true
        });
    }
    onMouseDown(e: MouseEvent) {
        if (gameManager.layerManager.getLayer() === undefined) {
            console.log("No active layer!");
            return;
        }
        this.active = true;
        const layer = gameManager.layerManager.getLayer()!;
        this.startPoint = l2g(getMouse(e));
        const fillColor = this.fillColor.spectrum("get");
        const fill = fillColor === null ? tinycolor("transparent") : fillColor;
        const borderColor = this.borderColor.spectrum("get");
        const border = borderColor === null ? tinycolor("transparent") : borderColor;
        this.rect = new Rect(this.startPoint.clone(), 0, 0, fill.toRgbString(), border.toRgbString());
        this.rect.owners.push(gameManager.username);
        if (layer.name === 'fow') {
            this.rect.visionObstruction = true;
            this.rect.movementObstruction = true;
        }
        gameManager.lightblockers.push(this.rect.uuid);
        layer.addShape(this.rect, true, false);
    }
    onMouseMove(e: MouseEvent) {
        if (!this.active) return;
        if (gameManager.layerManager.getLayer() === undefined) {
            console.log("No active layer!");
            return;
        }
        const layer = gameManager.layerManager.getLayer()!;
        const endPoint = l2g(getMouse(e));

        this.rect.w = Math.abs(endPoint.x - this.startPoint.x);
        this.rect.h = Math.abs(endPoint.y - this.startPoint.y);
        this.rect.refPoint.x = Math.min(this.startPoint.x, endPoint.x);
        this.rect.refPoint.y = Math.min(this.startPoint.y, endPoint.y);
        socket.emit("shapeMove", { shape: this.rect!.asDict(), temporary: false });
        layer.invalidate(false);
    }
    onMouseUp(e: MouseEvent) {
        this.active = false;
    }
}


export class RulerTool extends Tool {
    active: boolean = false;
    startPoint!: GlobalPoint;
    ruler!: Line;
    text!: Text;

    onMouseDown(e: MouseEvent) {
        if (gameManager.layerManager.getLayer() === undefined) {
            console.log("No active layer!");
            return;
        }
        this.active = true;
        const layer = gameManager.layerManager.getLayer("draw")!;
        this.startPoint = l2g(getMouse(e));
        this.ruler = new Line(this.startPoint, this.startPoint);
        this.text = new Text(this.startPoint.clone(), "", "bold 20px serif");
        this.ruler.owners.push(gameManager.username);
        this.text.owners.push(gameManager.username);
        layer.addShape(this.ruler, true, true);
        layer.addShape(this.text, true, true);
    }
    onMouseMove(e: MouseEvent) {
        if (!this.active) return;
        if (gameManager.layerManager.getLayer("draw") === undefined) {
            console.log("No draw layer!");
            return;
        }
        // Currently draw on active layer
        const layer = gameManager.layerManager.getLayer("draw")!;
        const endPoint = l2g(getMouse(e));

        this.ruler.endPoint = endPoint;
        socket.emit("shapeMove", { shape: this.ruler!.asDict(), temporary: true });

        const diffsign = Math.sign(endPoint.x - this.startPoint.x) * Math.sign(endPoint.y - this.startPoint.y);
        const xdiff = Math.abs(endPoint.x - this.startPoint.x);
        const ydiff = Math.abs(endPoint.y - this.startPoint.y);
        const label = Math.round(Math.sqrt((xdiff) ** 2 + (ydiff) ** 2) * gameManager.layerManager.unitSize / gameManager.layerManager.gridSize) + " ft";
        let angle = Math.atan2(diffsign * ydiff, xdiff);
        const xmid = Math.min(this.startPoint.x, endPoint.x) + xdiff / 2;
        const ymid = Math.min(this.startPoint.y, endPoint.y) + ydiff / 2;
        this.text.refPoint.x = xmid;
        this.text.refPoint.y = ymid;
        this.text.text = label;
        this.text.angle = angle;
        socket.emit("shapeMove", { shape: this.text.asDict(), temporary: true });
        layer.invalidate(true);
    }
    onMouseUp(e: MouseEvent) {
        if (!this.active) return;
        if (gameManager.layerManager.getLayer() === undefined) {
            console.log("No active layer!");
            return;
        }
        this.active = false;
        const layer = gameManager.layerManager.getLayer("draw")!;
        layer.removeShape(this.ruler, true, true);
        layer.removeShape(this.text, true, true);
        layer.invalidate(true);
    }
}

export class FOWTool extends Tool {
    active: boolean = false;
    startPoint!: GlobalPoint;
    rect!: Rect;
    detailDiv = $("<div>")
        .append($("<div>Reveal</div><label class='switch'><input type='checkbox' id='fow-reveal'><span class='slider round'></span></label>"))
        .append($("</div>"));
    onMouseDown(e: MouseEvent) {
        if (gameManager.layerManager.getLayer() === undefined) {
            console.log("No active layer!");
            return;
        }
        this.active = true;
        const layer = gameManager.layerManager.getLayer("fow")!;
        this.startPoint = l2g(getMouse(e));
        this.rect = new Rect(this.startPoint.clone(), 0, 0, gameManager.fowColour.spectrum("get").toRgbString());
        layer.addShape(this.rect, true, false);

        if ($("#fow-reveal").prop("checked"))
            this.rect.globalCompositeOperation = "destination-out";
        else
            this.rect.globalCompositeOperation = "source-over";
    }
    onMouseMove(e: MouseEvent) {
        if (!this.active) return;
        if (gameManager.layerManager.getLayer() === undefined) {
            console.log("No active layer!");
            return;
        }
        // Currently draw on active layer
        const layer = gameManager.layerManager.getLayer("fow")!;
        const endPoint = l2g(getMouse(e));

        this.rect.w = Math.abs(endPoint.x - this.startPoint.x);
        this.rect.h = Math.abs(endPoint.y - this.startPoint.y);
        this.rect.refPoint.x = Math.min(this.startPoint.x, endPoint.x);
        this.rect.refPoint.y = Math.min(this.startPoint.y, endPoint.y);

        socket.emit("shapeMove", { shape: this.rect.asDict(), temporary: false });
        layer.invalidate(false);
    }
    onMouseUp(e: MouseEvent) {
        this.active = false;
    }
}

export class MapTool extends Tool {
    active: boolean = false;
    startPoint!: GlobalPoint;
    rect!: Rect;
    xCount = $("<input type='text' value='3'>");
    yCount = $("<input type='text' value='3'>");
    detailDiv = $("<div>")
        .append($("<div>#X</div>")).append(this.xCount)
        .append($("<div>#Y</div>")).append(this.yCount)
        .append($("</div>"));
    onMouseDown(e: MouseEvent) {
        if (gameManager.layerManager.getLayer() === undefined) {
            console.log("No active layer!");
            return;
        }
        this.active = true;
        const layer = gameManager.layerManager.getLayer()!;
        this.startPoint = l2g(getMouse(e));
        this.rect = new Rect(this.startPoint, 0, 0, "rgba(0,0,0,0)", "black");
        layer.addShape(this.rect, false, false);
    }
    onMouseMove(e: MouseEvent) {
        if (!this.active) return;
        if (gameManager.layerManager.getLayer() === undefined) {
            console.log("No active layer!");
            return;
        }
        this.active = true;
        const layer = gameManager.layerManager.getLayer()!;
        const endPoint = l2g(getMouse(e));

        this.rect.w = Math.abs(endPoint.x - this.startPoint.x);
        this.rect.h = Math.abs(endPoint.y - this.startPoint.y);
        this.rect.refPoint.x = Math.min(this.startPoint.x, endPoint.x);
        this.rect.refPoint.y = Math.min(this.startPoint.y, endPoint.y);
        layer.invalidate(false);
    }
    onMouseUp(e: MouseEvent) {
        if (!this.active) return;
        if (gameManager.layerManager.getLayer() === undefined) {
            console.log("No active layer!");
            return;
        }
        this.active = false;
        const layer = gameManager.layerManager.getLayer()!;
        if (layer.selection.length !== 1) {
            layer.removeShape(this.rect!, false, false);
            return;
        }

        const w = this.rect.w;
        const h = this.rect.h;
        const sel = layer.selection[0];

        if (sel instanceof BaseRect) {
            sel.w *= parseInt(<string>this.xCount.val()) * gameManager.layerManager.gridSize / w;
            sel.h *= parseInt(<string>this.yCount.val()) * gameManager.layerManager.gridSize / h;
            console.log("Updated selection");
        }

        layer.removeShape(this.rect, false, false);
    }
}

export class InitiativeTracker {
    data: InitiativeData[] = [];
    addInitiative(data: InitiativeData, sync: boolean) {
        // Open the initiative tracker if it is not currently open.
        if (this.data.length === 0 || !gameManager.initiativeDialog.dialog("isOpen"))
            gameManager.initiativeDialog.dialog("open");
        // If no initiative given, assume it 0
        if (data.initiative === undefined)
            data.initiative = 0;
        // Check if the shape is already being tracked
        const existing = this.data.find(d => d.uuid === data.uuid);
        if (existing !== undefined) {
            Object.assign(existing, data);
            this.redraw();
        } else {
            this.data.push(data);
            this.redraw();
        }
        if (sync)
            socket.emit("updateInitiative", data);
    };
    removeInitiative(uuid: string, sync: boolean, skipGroupCheck: boolean) {
        const d = this.data.findIndex(d => d.uuid === uuid);
        if (d >= 0) {
            if (!skipGroupCheck && this.data[d].group) return;
            this.data.splice(d, 1);
            this.redraw();
            if (sync)
                socket.emit("updateInitiative", { uuid: uuid });
        }
        if (this.data.length === 0 && gameManager.initiativeDialog.dialog("isOpen"))
            gameManager.initiativeDialog.dialog("close");
    };
    redraw() {
        gameManager.initiativeDialog.empty();

        this.data.sort(function (a, b) {
            if (a.initiative === undefined) return 1;
            if (b.initiative === undefined) return -1;
            return b.initiative - a.initiative;
        });

        const self = this;

        this.data.forEach(function (data) {
            if (data.owners === undefined) data.owners = [];
            const img = data.src === undefined ? '' : $(`<img src="${data.src}" width="30px" data-uuid="${data.uuid}">`);
            // const name = $(`<input type="text" placeholder="name" data-uuid="${sh.uuid}" value="${sh.name}" disabled='disabled' style="grid-column-start: name">`);
            const val = $(`<input type="text" placeholder="value" data-uuid="${data.uuid}" value="${data.initiative}" style="grid-column-start: value">`);
            const visible = $(`<div data-uuid="${data.uuid}"><i class="fas fa-eye"></i></div>`);
            const group = $(`<div data-uuid="${data.uuid}"><i class="fas fa-users"></i></div>`);
            const remove = $(`<div style="grid-column-start: remove" data-uuid="${data.uuid}"><i class="fas fa-trash-alt"></i></div>`);

            visible.css("opacity", data.visible ? "1.0" : "0.3");
            group.css("opacity", data.group ? "1.0" : "0.3");
            if (!data.owners.includes(gameManager.username) && !gameManager.IS_DM) {
                val.prop("disabled", "disabled");
                remove.css("opacity", "0.3");
            }

            gameManager.initiativeDialog.append(img).append(val).append(visible).append(group).append(remove);

            val.on("change", function () {
                const d = self.data.find(d => d.uuid === $(this).data('uuid'));
                if (d === undefined) {
                    console.log("Initiativedialog change unknown uuid?");
                    return;
                }
                d.initiative = parseInt(<string>$(this).val()) || 0;
                self.addInitiative(d, true);
            });

            visible.on("click", function () {
                const d = self.data.find(d => d.uuid === $(this).data('uuid'))!;
                if (d === undefined) {
                    console.log("Initiativedialog visible unknown uuid?");
                    return;
                }
                if (!d.owners.includes(gameManager.username) && !gameManager.IS_DM)
                    return;
                d.visible = !d.visible;
                if (d.visible)
                    $(this).css("opacity", 1.0);
                else
                    $(this).css("opacity", 0.3);
                socket.emit("updateInitiative", d);
            });

            group.on("click", function () {
                const d = self.data.find(d => d.uuid === $(this).data('uuid'));
                if (d === undefined) {
                    console.log("Initiativedialog group unknown uuid?");
                    return;
                }
                if (!d.owners.includes(gameManager.username) && !gameManager.IS_DM)
                    return;
                d.group = !d.group;
                if (d.group)
                    $(this).css("opacity", 1.0);
                else
                    $(this).css("opacity", 0.3);
                socket.emit("updateInitiative", d);
            });

            remove.on("click", function () {
                const uuid = $(this).data('uuid');
                const d = self.data.find(d => d.uuid === uuid);
                if (d === undefined) {
                    console.log("Initiativedialog remove unknown uuid?");
                    return;
                }
                if (!d.owners.includes(gameManager.username) && !gameManager.IS_DM)
                    return;
                $(`[data-uuid=${uuid}]`).remove();
                self.removeInitiative(uuid, true, true);
            });
        });
    };
}

const tools = [
    { name: "select", playerTool: true, defaultSelect: true, hasDetail: false, clz: SelectTool },
    { name: "pan", playerTool: true, defaultSelect: false, hasDetail: false, clz: PanTool },
    { name: "draw", playerTool: true, defaultSelect: false, hasDetail: true, clz: DrawTool },
    { name: "ruler", playerTool: true, defaultSelect: false, hasDetail: false, clz: RulerTool },
    { name: "fow", playerTool: false, defaultSelect: false, hasDetail: true, clz: FOWTool },
    { name: "map", playerTool: false, defaultSelect: false, hasDetail: true, clz: MapTool },
];


// First go through each shape in the selection and see if the delta has to be truncated due to movement blockers

// This is definitely super convoluted and inefficient but I was tired and really wanted the smooth wall sliding collision stuff to work
// And it does now, so hey ¯\_(ツ)_/¯
function calculateDelta(delta: Vector<GlobalPoint>, sel: Shape, done?: string[]) {
    if (done === undefined) done = [];
    const ogSelBBox = sel.getBoundingBox();
    const newSelBBox = ogSelBBox.offset(delta);
    let refine = false;
    for (let mb = 0; mb < gameManager.movementblockers.length; mb++) {
        if (done.includes(gameManager.movementblockers[mb]))
            continue;
        const blocker = gameManager.layerManager.UUIDMap.get(gameManager.movementblockers[mb])!;
        const blockerBBox = blocker.getBoundingBox();
        // Check if the bounding box of our destination would intersect with the bounding box of the movementblocker
        if (blockerBBox.intersectsWith(newSelBBox) || blockerBBox.getIntersectWithLine({ start: ogSelBBox.refPoint.add(delta.normalize()), end: newSelBBox.refPoint }).intersect) {
            const bCenter = blockerBBox.center();
            const sCenter = ogSelBBox.center();

            const d = sCenter.subtract(bCenter);
            const ux = new Vector<GlobalPoint>({ x: 1, y: 0 });
            const uy = new Vector<GlobalPoint>({ x: 0, y: 1 });
            let dx = d.dot(ux);
            let dy = d.dot(uy);
            if (dx > blockerBBox.w / 2) dx = blockerBBox.w / 2;
            if (dx < -blockerBBox.w / 2) dx = -blockerBBox.w / 2;
            if (dy > blockerBBox.h / 2) dy = blockerBBox.h / 2;
            if (dy < -blockerBBox.h / 2) dy = -blockerBBox.h / 2;

            // Closest point / intersection point between the two bboxes.  Not the delta intersect!
            const p = bCenter.add(ux.multiply(dx)).add(uy.multiply(dy));

            if (p.x === ogSelBBox.refPoint.x || p.x === ogSelBBox.refPoint.x + ogSelBBox.w)
                delta.direction.x = 0;
            else if (p.y === ogSelBBox.refPoint.y || p.y === ogSelBBox.refPoint.y + ogSelBBox.h)
                delta.direction.y = 0;
            else {
                if (p.x < ogSelBBox.refPoint.x)
                    delta.direction.x = p.x - ogSelBBox.refPoint.x;
                else if (p.x > ogSelBBox.refPoint.x + ogSelBBox.w)
                    delta.direction.x = p.x - (ogSelBBox.refPoint.x + ogSelBBox.w);
                else if (p.y < ogSelBBox.refPoint.y)
                    delta.direction.y = p.y - ogSelBBox.refPoint.y;
                else if (p.y > ogSelBBox.refPoint.y + ogSelBBox.h)
                    delta.direction.y = p.y - (ogSelBBox.refPoint.y + ogSelBBox.h);
            }
            refine = true;
            done.push(gameManager.movementblockers[mb]);
            break;
        }
    }
    if (refine)
        delta = calculateDelta(delta, sel, done);
    return delta;
}