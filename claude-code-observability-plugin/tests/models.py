from pydantic import BaseModel, ConfigDict


class TestFixture(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    description: str
    command: str
    expected_status_code: int
    expected_fields: list[str]
    tags: list[str]
    before_test: str | None = None
    after_test: str | None = None
