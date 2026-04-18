from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

pool_kwargs: dict = {"pool_size": 5, "max_overflow": 10, "pool_pre_ping": True}

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    **pool_kwargs,
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session
