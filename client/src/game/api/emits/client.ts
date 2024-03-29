import type { ServerUserLocationOptions } from "../../models/settings";
import type { ClientId, Viewport } from "../../systems/client/models";
import { positionState } from "../../systems/position/state";
import type { ServerPlayerOptions } from "../../systems/settings/players/models";
import { wrapSocket } from "../helpers";
import { socket } from "../socket";

export function sendClientLocationOptions(temp: boolean): void {
    const state = positionState.readonly;
    _sendClientLocationOptions(
        {
            pan_x: state.panX - state.gridOffset.x,
            pan_y: state.panY - state.gridOffset.y,
            zoom_display: positionState.raw.zoomDisplay,
        },
        temp,
    );
}

function _sendClientLocationOptions(locationOptions: ServerUserLocationOptions, temp: boolean): void {
    socket.emit("Client.Options.Location.Set", { options: locationOptions, temp });
}

export const sendViewport = wrapSocket<Viewport>("Client.Viewport.Set");
export const sendOffset = wrapSocket<{ client: ClientId; x?: number; y?: number }>("Client.Offset.Set");

export function sendRoomClientOptions<T extends keyof ServerPlayerOptions>(
    key: T,
    value: ServerPlayerOptions[T] | undefined,
    defaultValue: ServerPlayerOptions[T] | undefined,
): void {
    const event = defaultValue !== undefined ? "Client.Options.Default.Set" : "Client.Options.Room.Set";
    const val = defaultValue !== undefined ? defaultValue : value ?? null;
    socket.emit(event, { [key]: val });
}

export const sendMoveClient = wrapSocket<{ client: ClientId; data: ServerUserLocationOptions }>("Client.Move");
