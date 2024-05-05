# pdf_metadata_scraper
## simple javascript library to read metadata from a PDF

## Usage
Simply include in your project. The library defines two classes, PDFScraper, and the helper class BufferWrangler. 
Instantiate PDFScraper with a variable holding the contents of your PDF and select one of the different output
methods. For simply viewing the PDF metadata, you might want to use the ```pretty_print``` or ```pretty_print_unique_values``` methods.

You can test the functionality of this library by going to its [github page](https://genosse-c.github.io/pdf_metadata_scraper/)

## Thanks
This library is based on [pdf_info](https://github.com/preciz/pdf_info) by [preciz](https://github.com/preciz) with additional code
lifted from [uint8array-extras](https://github.com/sindresorhus/uint8array-extras) by [sindresorhus](https://github.com/sindresorhus)

## And always
This library is basically beta, and I doubt I will change much on it. So use it at your own risk. I'm using it inside a
Google App Script into which more featurefull PDF libraries are not easy to integrate because of their use of 
*async / await*. This library does not use any *async* functions and is therefore fairly easy to integrate.

