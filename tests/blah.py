from typing import Collection, Union


def foo(col: Collection[Union[int, str]]):
    print(col)


def bar(name: str, id: int):
    ...


foo([1, 2, "3", '4', 5])
foo([1, 2, "3", '4', 5, 6.0])
