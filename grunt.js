module.exports = function( grunt ) {

grunt.loadNpmTasks( "grunt-clean" );
grunt.loadNpmTasks( "grunt-html" );
grunt.loadNpmTasks( "grunt-wordpress" );
grunt.loadNpmTasks( "grunt-jquery-content" );

grunt.initConfig({
	clean: {
		folder: "dist/"
	},
	htmllint: {
		page: "page/**.html"
	},
	jshint: {
		options: {
			undef: true,
			node: true
		}
	},
	lint: {
		grunt: "grunt.js"
	},
	watch: {
		pages: {
			files: "page/**.html",
			tasks: "deploy"
		}
	},
	"build-pages": {
		all: grunt.file.expandFiles( "page/**" )
	},
	"build-resources": {
		all: grunt.file.expandFiles( "resources/**" )
	},
	wordpress: grunt.utils._.extend({
		dir: "dist/wordpress"
	}, grunt.file.readJSON( "config.json" ) )
});

grunt.registerTask( "build-download", function() {
	function writeFiles() {
		var frontend = new ( require( "download.jqueryui.com" ) )( "http://download.jqueryui.com" ),
			resources = grunt.file.expandFiles( dir + "/app/**" ),
			download = frontend.download,
			themeroller = frontend.themeroller;

		grunt.file.write( grunt.config( "wordpress.dir" ) + "/posts/page/download.html",
			"<script>{\n \"title\": \"Download Builder\"\n}</script>\n" + download.index() );

		grunt.file.write( grunt.config( "wordpress.dir" ) + "/posts/page/themeroller.html",
			"<script>{\n \"title\": \"ThemeRoller\"\n}</script>\n" + themeroller.index() );

		resources.forEach(function( file ) {
			grunt.file.copy( file, file.replace( dir + "/app", grunt.config( "wordpress.dir" ) ) );
		});

		grunt.log.write( "Wrote download.html, themeroller.html and " + resources.length + " resources." );
	}
	var path = require( "path" ),
		dir = path.dirname( require.resolve( "download.jqueryui.com" ) ),
		done = this.async();

	if ( grunt.option( "noprepare" ) ) {
		writeFiles();
		done();
		return;
	}
	// at this point, the download builder repo is available, so let's initialize it
	grunt.log.writeln( "Initializing download module, might take a while..." );
	grunt.utils.spawn({
		cmd: "grunt",
		// TODO need to set this as config property or use the version from package.json
		args: [ "prepare:master" ],
		opts: {
			cwd: "node_modules/download.jqueryui.com"
		}
	}, function( error, result, stringResult ) {
		if ( error ) {
			grunt.log.error( error, stringResult );
			done( false );
			return;
		}
		writeFiles();
		done();
	});
});

grunt.registerTask( "build-demos", function() {
	// We hijack the jquery-ui checkout from download.jqueryui.com
	this.requires( "build-download" );

	var path = require( "path" ),
		cheerio = require( "cheerio" ),
		repoDir = path.dirname( require.resolve( "download.jqueryui.com" ) ) +
			"/tmp/jquery-ui",
		demosDir = repoDir + "/demos",
		distDir = repoDir + "/dist",
		targetDir = grunt.config( "wordpress.dir" ) + "/resources/demos",
		highlightDir = targetDir + "-highlight",
		demoList = {};

	// Copy all demos files to /resources/demos
	grunt.file.recurse( demosDir, function( abspath, rootdir, subdir, filename ) {
		if ( filename === "index.html" ) {
			return;
		}

		var content, $,
			dest = targetDir + "/" + subdir + "/" + filename,
			highlightDest = highlightDir + "/" + subdir + "/" + filename;

		if ( /html$/.test( filename ) ) {
			content = replaceResources( grunt.file.read( abspath ) );

			if ( !( /(\/)/.test( subdir ) ) ) {
				$ = cheerio.load( content ).root();
				if ( !demoList[ subdir ] ) {
					demoList[ subdir ] = {};
				}
				demoList[ subdir ][ filename.substr( 0, filename.length - 5 ) ] = {
					title: $.find( "title" ).text().replace( /[^\-]+\s-\s/, '' ),
					description: $.find( ".demo-description" ).remove().html()
				};

				// Save modified demo
				content = $.html();
				grunt.file.write( dest, content );

				// Create syntax highlighted version
				$ = cheerio.load( "<pre><code data-linenum='true'></code></pre>" ).root();
				$.find( "code" ).text( content );
				grunt.file.write( highlightDest,
					grunt.helper( "syntax-highlight", { content: $.html() } ) );
			} else {
				grunt.file.write( dest, content );
			}
		} else {
			grunt.file.copy( abspath, dest );
		}
	});

	// Create list of all demos
	grunt.file.write( targetDir + "/demo-list.json", JSON.stringify( demoList ) );

	// Copy the built files into /resources/demos
	grunt.file.copy(
		grunt.file.expandFiles( repoDir + "/jquery-*.js" )[ 0 ],
		targetDir + "/jquery.js" );
	grunt.file.copy( distDir + "/jquery-ui.js", targetDir + "/jquery-ui.js" );
	grunt.file.copy( distDir + "/jquery-ui.css", targetDir + "/theme/jquery-ui.css" );
	grunt.file.expandFiles( distDir + "/images/**" ).forEach(function( filename ) {
		grunt.file.copy( filename, targetDir + "/theme/images/" + path.basename( filename ) );
	});

	// Copy externals into /resources/demos/external
	grunt.file.expandFiles( repoDir + "/external/**" ).forEach(function( filename ) {
		grunt.file.copy( filename, targetDir + "/external/" + path.basename( filename ) );
	});

	function replaceResources( source ) {
		// ../../jquery-x.y.z.js -> /resources/demos/jquery.js
		source = source.replace(
			/<script src="\.\.\/\.\.\/jquery-\d+\.\d+(\.\d+)?\.js">/,
			"<script src=\"/resources/demos/jquery.js\">" );

		// ../../ui/* -> /resources/demos/jquery-ui.js
		// Only the first script is replaced, all subsequent scripts are dropped,
		// including the full line
		source = source.replace(
			/<script src="\.\.\/\.\.\/ui\/[^>]+>/,
			"<script src=\"/resources/demos/jquery-ui.js\">" );
		source = source.replace(
			/^.*<script src="\.\.\/\.\.\/ui\/[^>]+><\/script>\n/gm,
			"" );

		// ../../external/* -> /resources/demos/external/*
		source = source.replace(
			/<script src="\.\.\/\.\.\/external\//g,
			"<script src=\"/resources/demos/external/" );

		// ../../ui/themes/* -> /resources/demos/theme/jquery-ui.css
		source = source.replace(
			/<link rel="stylesheet" href="\.\.\/\.\.\/themes[^>]+>/,
			"<link rel=\"stylesheet\" href=\"/resources/demos/theme/jquery-ui.css\">" );

		// ../demos.css -> /resources/demos/style.css
		source = source.replace(
			/<link rel="stylesheet" href="\.\.\/demos.css\">/,
			"<link rel=\"stylesheet\" href=\"/resources/demos/style.css\">" );

		return source;
	}
});

grunt.registerTask( "copy-taxonomies", function() {
	grunt.file.copy( "taxonomies.json",
		grunt.config( "wordpress.dir" ) + "/taxonomies.json" );
});

grunt.registerTask( "default", "lint" );
grunt.registerTask( "build", "build-pages build-resources build-download build-demos copy-taxonomies" );
grunt.registerTask( "build-wordpress", "clean lint build" );

};
