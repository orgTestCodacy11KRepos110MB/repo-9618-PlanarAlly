from typing import TYPE_CHECKING, List, Literal, Optional, cast, overload

import bcrypt
from peewee import (
    BooleanField,
    FloatField,
    ForeignKeyField,
    IntegerField,
    TextField,
    fn,
)
from playhouse.shortcuts import model_to_dict

from ..api.models.user import ApiOptionalUserOptions, ApiUserOptions
from .base import BaseModel
from .typed import SelectSequence

if TYPE_CHECKING:
    from .campaign import PlayerRoom, Room
    from .label import Label


__all__ = ["User", "UserOptions"]


class UserOptions(BaseModel):
    id: int

    fow_colour = cast(str | None, TextField(default="#000", null=True))
    grid_colour = cast(str | None, TextField(default="#000", null=True))
    ruler_colour = cast(str | None, TextField(default="#F00", null=True))
    use_tool_icons = cast(bool | None, BooleanField(default=True, null=True))
    show_token_directions = cast(bool | None, BooleanField(default=True, null=True))

    invert_alt = cast(bool | None, BooleanField(default=False, null=True))
    disable_scroll_to_zoom = cast(bool | None, BooleanField(default=False, null=True))
    # false = use absolute mode ; true = use relative mode
    default_tracker_mode = cast(bool | None, BooleanField(default=False, null=True))
    # 0 = no pan  1 = middle mouse only  2 = right mouse only 3 = both
    mouse_pan_mode = cast(int | None, IntegerField(default=3, null=True))

    use_high_dpi = cast(bool | None, BooleanField(default=False, null=True))
    grid_size = cast(int | None, IntegerField(default=50, null=True))
    use_as_physical_board = cast(bool | None, BooleanField(default=False, null=True))
    mini_size = cast(float | None, FloatField(default=1, null=True))
    ppi = cast(int | None, IntegerField(default=96, null=True))

    initiative_camera_lock = cast(bool | None, BooleanField(default=False, null=True))
    initiative_vision_lock = cast(bool | None, BooleanField(default=False, null=True))
    initiative_effect_visibility = cast(
        str | None, TextField(default="active", null=True)
    )
    initiative_open_on_activate = cast(
        bool | None, BooleanField(default=True, null=True)
    )

    render_all_floors = cast(bool | None, BooleanField(default=True, null=True))

    @classmethod
    def create_empty(cls):
        return UserOptions.create(
            fow_colour=None,
            grid_colour=None,
            ruler_colour=None,
            use_tool_icons=None,
            show_token_directions=None,
            invert_alt=None,
            disable_scroll_to_zoom=None,
            default_tracker_mode=None,
            mouse_pan_mode=None,
            use_high_dpi=None,
            grid_size=None,
            use_as_physical_board=None,
            mini_size=None,
            ppi=None,
            initiative_camera_lock=None,
            initiative_vision_lock=None,
            initiative_effect_visibility=None,
            initiative_open_on_activate=None,
            render_all_floors=None,
        )

    @overload
    def as_pydantic(self, optional: Literal[True]) -> ApiOptionalUserOptions:
        ...

    @overload
    def as_pydantic(self, optional: Literal[False]) -> ApiUserOptions:
        ...

    @overload
    def as_pydantic(self, optional: bool) -> ApiOptionalUserOptions | ApiUserOptions:
        ...

    def as_pydantic(self, optional: bool):
        target = ApiUserOptions if not optional else ApiOptionalUserOptions

        # I tried with an overload and a generic, but the type system just couldn't infer it :(
        return target(
            fow_colour=self.fow_colour,  # type: ignore
            grid_colour=self.grid_colour,  # type: ignore
            ruler_colour=self.ruler_colour,  # type: ignore
            use_tool_icons=self.use_tool_icons,  # type: ignore
            show_token_directions=self.show_token_directions,  # type: ignore
            invert_alt=self.invert_alt,  # type: ignore
            disable_scroll_to_zoom=self.disable_scroll_to_zoom,  # type: ignore
            default_tracker_mode=self.default_tracker_mode,  # type: ignore
            mouse_pan_mode=self.mouse_pan_mode,  # type: ignore
            use_high_dpi=self.use_high_dpi,  # type: ignore
            grid_size=self.grid_size,  # type: ignore
            use_as_physical_board=self.use_as_physical_board,  # type: ignore
            mini_size=self.mini_size,  # type: ignore
            ppi=self.ppi,  # type: ignore
            initiative_camera_lock=self.initiative_camera_lock,  # type: ignore
            initiative_vision_lock=self.initiative_vision_lock,  # type: ignore
            initiative_effect_visibility=self.initiative_effect_visibility,  # type: ignore
            initiative_open_on_activate=self.initiative_open_on_activate,  # type: ignore
            render_all_floors=self.render_all_floors,  # type: ignore
        )


class User(BaseModel):
    id: int
    labels: List["Label"]
    rooms_created: SelectSequence["Room"]
    rooms_joined: SelectSequence["PlayerRoom"]

    name = cast(str, TextField())
    email = TextField(null=True)
    password_hash = cast(str, TextField())
    default_options = cast(
        UserOptions, ForeignKeyField(UserOptions, on_delete="CASCADE")
    )

    colour_history = cast(Optional[str], TextField(null=True))

    def __repr__(self):
        return f"<User {self.name}>"

    def set_password(self, pw: str):
        pwhash = bcrypt.hashpw(pw.encode("utf8"), bcrypt.gensalt())
        self.password_hash = pwhash.decode("utf8")

    def check_password(self, pw: str):
        if self.password_hash is None:
            return False
        expected_hash = self.password_hash.encode("utf8")
        return bcrypt.checkpw(pw.encode("utf8"), expected_hash)

    def as_dict(self):
        return model_to_dict(
            self,
            recurse=False,
            exclude=[User.id, User.password_hash, User.default_options],
        )

    @classmethod
    def by_name(cls, name: str) -> "User":
        return cls.get_or_none(fn.Lower(cls.name) == name.lower())
