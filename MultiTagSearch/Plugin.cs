using System;
using System.Collections.Generic;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;

namespace MultiTagSearch
{
    /// <summary>
    /// Adds a "Tag Search" page to the Emby web app that finds items having ALL of the
    /// selected tags (Emby's built-in tag filter only matches ANY of them).
    /// The page only uses the standard Emby REST API; results open Emby's own item page and player.
    /// </summary>
    public class Plugin : BasePlugin, IHasWebPages
    {
        private static readonly Guid PluginId = new Guid("b40634d4-e395-4b3e-b759-e655c7176966");

        public override string Name => "Multi-Tag Search";

        public override Guid Id => PluginId;

        public override string Description => "Find media that has all of the selected tags, with optional excluded tags.";

        public IEnumerable<PluginPageInfo> GetPages()
        {
            var ns = GetType().Namespace;

            return new[]
            {
                new PluginPageInfo
                {
                    Name = "multitagsearch",
                    DisplayName = "Tag Search",
                    EmbeddedResourcePath = ns + ".Web.multitagsearch.html",
                    MenuIcon = "sell",
                    EnableInMainMenu = true,
                    EnableInUserMenu = true
                },
                new PluginPageInfo
                {
                    Name = "multitagsearchjs",
                    EmbeddedResourcePath = ns + ".Web.multitagsearch.js"
                }
            };
        }
    }
}
