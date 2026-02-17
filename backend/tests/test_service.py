"""Tests for the service layer (namespace resolution, caching, reload)."""

import os

import pytest

from app.service import _db_path_for_namespace, get_kb, list_namespaces, reload_kb


class TestDbPathForNamespace:
    def test_default_namespace_returns_base_path(self):
        path = _db_path_for_namespace("")
        assert path.endswith("knowledge_base.db")

    def test_named_namespace_appends_suffix(self):
        path = _db_path_for_namespace("myproject")
        assert path.endswith("knowledge_base_myproject.db")

    def test_namespace_with_hyphens_and_underscores(self):
        path = _db_path_for_namespace("my-project_v2")
        assert path.endswith("knowledge_base_my-project_v2.db")

    def test_invalid_namespace_raises(self):
        with pytest.raises(ValueError, match="Invalid KB_NAMESPACE"):
            _db_path_for_namespace("bad/namespace")

    def test_invalid_namespace_with_spaces_raises(self):
        with pytest.raises(ValueError, match="Invalid KB_NAMESPACE"):
            _db_path_for_namespace("bad namespace")

    def test_invalid_namespace_with_dots_raises(self):
        with pytest.raises(ValueError, match="Invalid KB_NAMESPACE"):
            _db_path_for_namespace("bad.namespace")

    def test_custom_kb_db_path_env(self, monkeypatch, tmp_path):
        custom_path = str(tmp_path / "custom.db")
        monkeypatch.setenv("KB_DB_PATH", custom_path)
        path = _db_path_for_namespace("")
        assert path == custom_path

    def test_custom_kb_db_path_with_namespace(self, monkeypatch, tmp_path):
        custom_path = str(tmp_path / "custom.db")
        monkeypatch.setenv("KB_DB_PATH", custom_path)
        path = _db_path_for_namespace("test")
        assert path.endswith("custom_test.db")


class TestGetKb:
    def test_returns_vector_knowledge_base(self, tmp_path, monkeypatch):
        monkeypatch.setenv("KB_DB_PATH", str(tmp_path / "test.db"))
        get_kb.cache_clear()
        kb = get_kb("")
        assert kb is not None
        kb.close()
        get_kb.cache_clear()

    def test_caches_same_namespace(self, tmp_path, monkeypatch):
        monkeypatch.setenv("KB_DB_PATH", str(tmp_path / "test.db"))
        get_kb.cache_clear()
        kb1 = get_kb("")
        kb2 = get_kb("")
        assert kb1 is kb2
        kb1.close()
        get_kb.cache_clear()

    def test_different_namespaces_return_different_instances(self, tmp_path, monkeypatch):
        monkeypatch.setenv("KB_DB_PATH", str(tmp_path / "test.db"))
        get_kb.cache_clear()
        kb1 = get_kb("")
        kb2 = get_kb("other")
        assert kb1 is not kb2
        kb1.close()
        kb2.close()
        get_kb.cache_clear()


class TestReloadKb:
    def test_reload_returns_fresh_instance(self, tmp_path, monkeypatch):
        monkeypatch.setenv("KB_DB_PATH", str(tmp_path / "test.db"))
        get_kb.cache_clear()
        original = get_kb("")
        reloaded = reload_kb("")
        assert reloaded is not original
        reloaded.close()
        get_kb.cache_clear()


class TestListNamespaces:
    def test_empty_directory(self, tmp_path, monkeypatch):
        monkeypatch.setenv("KB_DB_PATH", str(tmp_path / "knowledge_base.db"))
        assert list_namespaces() == []

    def test_finds_namespace_files(self, tmp_path, monkeypatch):
        monkeypatch.setenv("KB_DB_PATH", str(tmp_path / "knowledge_base.db"))
        # Create namespace DB files
        (tmp_path / "knowledge_base_alpha.db").touch()
        (tmp_path / "knowledge_base_beta.db").touch()
        result = list_namespaces()
        assert sorted(result) == ["alpha", "beta"]

    def test_ignores_non_namespace_files(self, tmp_path, monkeypatch):
        monkeypatch.setenv("KB_DB_PATH", str(tmp_path / "knowledge_base.db"))
        (tmp_path / "knowledge_base.db").touch()  # default, not a namespace
        (tmp_path / "other_file.db").touch()  # unrelated
        (tmp_path / "knowledge_base_valid.db").touch()
        result = list_namespaces()
        assert result == ["valid"]

    def test_nonexistent_directory(self, monkeypatch):
        monkeypatch.setenv("KB_DB_PATH", "/nonexistent/path/kb.db")
        assert list_namespaces() == []
