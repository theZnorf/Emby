define([], function () {
    'use strict';

    // Search state survives navigating to an item and back.
    var STORAGE_KEY = 'multitagsearch-state';

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function norm(name) {
        return String(name || '').trim().toLowerCase();
    }

    function loadState() {
        try {
            return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || null;
        } catch (e) {
            return null;
        }
    }

    function saveState(state) {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            // storage unavailable; state just won't persist
        }
    }

    function getApiClient() {
        return globalThis.ApiClient;
    }

    function getItemsUrl(apiClient, query) {
        return apiClient.getUrl('Users/' + apiClient.getCurrentUserId() + '/Items', query);
    }

    function View(view, params) {
        var self = this;

        self.view = view;
        self.include = [];
        self.exclude = [];
        // lower-cased tag name -> { Name, Id }
        self.tagsByName = {};
        self.initialized = false;
        self.searchToken = 0;

        var form = view.querySelector('form');

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            // Pick up text typed but not yet confirmed with Enter.
            self.commitInput('include');
            self.commitInput('exclude');
            self.search();
            return false;
        });

        view.querySelector('.mts-btnClear').addEventListener('click', function () {
            self.include = [];
            self.exclude = [];
            self.renderChips();
            self.clearResults();
            self.persist();
        });

        ['include', 'exclude'].forEach(function (kind) {
            var input = self.getInput(kind);

            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ',') {
                    if (input.value.trim()) {
                        e.preventDefault();
                        self.commitInput(kind);
                    }
                } else if (e.key === 'Backspace' && !input.value && self[kind].length) {
                    self[kind].pop();
                    self.renderChips();
                }
            });

            // Selecting an entry from the datalist fires "input" with the full tag name.
            // Chrome/Firefox report datalist picks as insertReplacementText or without an inputType.
            input.addEventListener('input', function (e) {
                var picked = !e.inputType || e.inputType === 'insertReplacementText';
                if (picked && self.tagsByName[norm(input.value)]) {
                    self.commitInput(kind);
                }
            });
        });

        view.querySelector('.mts-chips.mts-includeChips').addEventListener('click', function (e) {
            self.onChipClick(e, 'include');
        });
        view.querySelector('.mts-chips.mts-excludeChips').addEventListener('click', function (e) {
            self.onChipClick(e, 'exclude');
        });

        view.querySelector('.mts-mode').addEventListener('change', function () {
            view.querySelector('.mts-modeLabel').textContent = this.value === 'any' ? 'any' : 'all';
        });

        view.querySelector('.mts-library').addEventListener('change', function () {
            self.loadTags();
        });
        view.querySelector('.mts-types').addEventListener('change', function () {
            self.loadTags();
        });

        view.querySelector('.mts-results').addEventListener('click', function (e) {
            var card = e.target.closest('.mts-card');
            if (!card || !globalThis.Emby || !Emby.Page || !Emby.Page.showItem) {
                return;
            }
            e.preventDefault();
            // Hand over to Emby's own item page (and from there its own player).
            Emby.Page.showItem(card.getAttribute('data-id'));
        });

        view.addEventListener('viewshow', function () {
            self.onShow();
        });
    }

    View.prototype.getInput = function (kind) {
        return this.view.querySelector(kind === 'include' ? '.mts-includeInput' : '.mts-excludeInput');
    };

    View.prototype.onShow = function () {
        var self = this;

        if (self.initialized) {
            return;
        }
        self.initialized = true;

        var state = loadState();
        if (state) {
            self.include = state.include || [];
            self.exclude = state.exclude || [];
            self.setSelect('.mts-mode', state.mode);
            self.setSelect('.mts-types', state.types);
            self.setSelect('.mts-sort', state.sort);
            self.view.querySelector('.mts-modeLabel').textContent = state.mode === 'any' ? 'any' : 'all';
        }
        self.renderChips();

        self.loadLibraries(state && state.library).then(function () {
            return self.loadTags();
        }).then(function () {
            if (state && state.searched && (self.include.length || self.exclude.length)) {
                self.search();
            }
        });
    };

    View.prototype.setSelect = function (selector, value) {
        var select = this.view.querySelector(selector);
        if (value == null) {
            return;
        }
        for (var i = 0; i < select.options.length; i++) {
            if (select.options[i].value === value) {
                select.value = value;
                return;
            }
        }
    };

    View.prototype.persist = function (searched) {
        saveState({
            include: this.include,
            exclude: this.exclude,
            mode: this.view.querySelector('.mts-mode').value,
            types: this.view.querySelector('.mts-types').value,
            library: this.view.querySelector('.mts-library').value,
            sort: this.view.querySelector('.mts-sort').value,
            searched: !!searched
        });
    };

    View.prototype.loadLibraries = function (selected) {
        var self = this;
        var apiClient = getApiClient();
        var select = self.view.querySelector('.mts-library');

        return apiClient.getJSON(apiClient.getUrl('Users/' + apiClient.getCurrentUserId() + '/Views')).then(function (result) {
            var html = '<option value="">All libraries</option>';
            (result.Items || []).forEach(function (lib) {
                html += '<option value="' + escapeHtml(lib.Id) + '">' + escapeHtml(lib.Name) + '</option>';
            });
            select.innerHTML = html;
            self.setSelect('.mts-library', selected);
        }, function () {
            // keep "All libraries" only
        });
    };

    View.prototype.getBaseQuery = function () {
        var query = { Recursive: true };
        var types = this.view.querySelector('.mts-types').value;
        var library = this.view.querySelector('.mts-library').value;

        if (types) {
            query.IncludeItemTypes = types;
        }
        if (library) {
            query.ParentId = library;
        }
        return query;
    };

    View.prototype.loadTags = function () {
        var self = this;
        var apiClient = getApiClient();
        var query = self.getBaseQuery();

        query.UserId = apiClient.getCurrentUserId();
        query.SortBy = 'SortName';

        return apiClient.getJSON(apiClient.getUrl('Tags', query)).then(function (result) {
            var html = '';
            self.tagsByName = {};
            (result.Items || []).forEach(function (tag) {
                self.tagsByName[norm(tag.Name)] = { Name: tag.Name, Id: tag.Id };
                html += '<option value="' + escapeHtml(tag.Name) + '"></option>';
            });
            self.view.querySelector('#mtsTagList').innerHTML = html;
        }, function () {
            self.setStatus('Could not load the tag list from the server.');
        });
    };

    View.prototype.commitInput = function (kind) {
        var input = this.getInput(kind);
        var value = input.value.replace(/,$/, '').trim();

        input.value = '';
        if (!value) {
            return;
        }

        // Prefer the server's spelling of the tag.
        var known = this.tagsByName[norm(value)];
        var name = known ? known.Name : value;
        var list = this[kind];

        if (!list.some(function (t) { return norm(t) === norm(name); })) {
            list.push(name);
        }
        this.renderChips();
    };

    View.prototype.onChipClick = function (e, kind) {
        var btn = e.target.closest('button[data-index]');
        if (!btn) {
            return;
        }
        this[kind].splice(parseInt(btn.getAttribute('data-index'), 10), 1);
        this.renderChips();
    };

    View.prototype.renderChips = function () {
        var self = this;

        ['include', 'exclude'].forEach(function (kind) {
            var html = self[kind].map(function (tag, i) {
                return '<span class="mts-chip' + (kind === 'exclude' ? ' mts-exclude' : '') + '">' +
                    escapeHtml(tag) +
                    '<button type="button" data-index="' + i + '" title="Remove">&#x2715;</button></span>';
            }).join('');
            self.view.querySelector(kind === 'include' ? '.mts-includeChips' : '.mts-excludeChips').innerHTML = html;
        });
    };

    View.prototype.setStatus = function (text) {
        this.view.querySelector('.mts-status').textContent = text;
    };

    View.prototype.clearResults = function () {
        this.searchToken++;
        this.setStatus('');
        this.view.querySelector('.mts-results').innerHTML = '';
    };

    View.prototype.resolveTags = function (names) {
        var self = this;
        var unknown = [];
        var resolved = [];

        names.forEach(function (name) {
            var tag = self.tagsByName[norm(name)];
            if (tag) {
                resolved.push(tag);
            } else {
                unknown.push(name);
            }
        });
        return { resolved: resolved, unknown: unknown };
    };

    View.prototype.search = function () {
        var self = this;
        var apiClient = getApiClient();
        var matchAll = self.view.querySelector('.mts-mode').value !== 'any';
        var include = self.resolveTags(self.include);
        var exclude = self.resolveTags(self.exclude);
        var token = ++self.searchToken;

        self.persist(true);

        if (!self.include.length && !self.exclude.length) {
            self.clearResults();
            self.setStatus('Add at least one tag.');
            return;
        }

        if (include.unknown.length && (matchAll || !include.resolved.length)) {
            // An unknown required tag can never match anything.
            self.view.querySelector('.mts-results').innerHTML = '';
            self.setStatus('No items found. Unknown tag(s) in this library: ' + include.unknown.join(', '));
            return;
        }

        self.setStatus('Searching…');

        var baseQuery = self.getBaseQuery();

        // For AND, fetch only the items of the rarest tag and check the others locally.
        var candidateTagsPromise;
        if (!include.resolved.length) {
            candidateTagsPromise = Promise.resolve(null);
        } else if (!matchAll || include.resolved.length === 1) {
            candidateTagsPromise = Promise.resolve(include.resolved);
        } else {
            candidateTagsPromise = Promise.all(include.resolved.map(function (tag) {
                var q = Object.assign({}, baseQuery, { TagIds: tag.Id, Limit: 0 });
                return apiClient.getJSON(getItemsUrl(apiClient, q)).then(function (r) {
                    return { tag: tag, count: r.TotalRecordCount };
                });
            })).then(function (counts) {
                counts.sort(function (a, b) { return a.count - b.count; });
                return [counts[0].tag];
            });
        }

        candidateTagsPromise.then(function (candidateTags) {
            var sort = self.view.querySelector('.mts-sort').value.split(',');
            var query = Object.assign({}, baseQuery, {
                // "Tags" is returned as TagItems ({ Name, Id }).
                Fields: 'Tags,ProductionYear,PrimaryImageAspectRatio',
                SortBy: sort[0] === 'SortName' ? 'SortName' : sort[0] + ',SortName',
                SortOrder: sort[1],
                EnableImageTypes: 'Primary',
                ImageTypeLimit: 1,
                EnableUserData: false
            });
            if (candidateTags) {
                query.TagIds = candidateTags.map(function (t) { return t.Id; }).join(',');
            }
            return apiClient.getJSON(getItemsUrl(apiClient, query));
        }).then(function (result) {
            if (token !== self.searchToken) {
                return;
            }

            var required = include.resolved.map(function (t) { return norm(t.Name); });
            var forbidden = exclude.resolved.map(function (t) { return norm(t.Name); });

            var items = (result.Items || []).filter(function (item) {
                var tags = (item.TagItems || []).map(function (t) { return norm(t.Name); });
                var has = function (t) { return tags.indexOf(t) !== -1; };

                if (forbidden.some(has)) {
                    return false;
                }
                if (!required.length) {
                    return true;
                }
                return matchAll ? required.every(has) : required.some(has);
            });

            self.renderResults(items);
        }).catch(function () {
            if (token === self.searchToken) {
                self.setStatus('Search failed. Check the server connection and try again.');
            }
        });
    };

    View.prototype.renderResults = function (items) {
        var apiClient = getApiClient();
        var html = items.map(function (item) {
            var href = '#';
            try {
                href = Emby.Page.getRouteUrl(item) || '#';
            } catch (e) {
                // fall back to the click handler
            }

            var img = item.ImageTags && item.ImageTags.Primary ?
                '<img loading="lazy" alt="" src="' + escapeHtml(apiClient.getUrl('Items/' + item.Id + '/Images/Primary', {
                    maxWidth: 320,
                    tag: item.ImageTags.Primary,
                    quality: 90
                })) + '" />' :
                '<span>' + escapeHtml(item.Name) + '</span>';

            var sub = [item.SeriesName, item.ProductionYear].filter(Boolean).join(' · ');
            var tags = (item.TagItems || []).map(function (t) { return t.Name; }).join(', ');

            return '<a class="mts-card" href="' + escapeHtml(href) + '" data-id="' + escapeHtml(item.Id) + '" title="' + escapeHtml(tags) + '">' +
                '<div class="mts-poster">' + img + '</div>' +
                '<div class="mts-title">' + escapeHtml(item.Name) + '</div>' +
                '<div class="mts-sub">' + escapeHtml(sub) + '</div>' +
                '</a>';
        }).join('');

        this.view.querySelector('.mts-results').innerHTML = html;
        this.setStatus(items.length === 1 ? '1 item' : items.length + ' items');
    };

    return View;
});
