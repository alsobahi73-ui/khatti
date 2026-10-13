/* تهيئة العرض التجريبي فقط؛ جميع البيانات محلية وغير موثقة. */
function seedDemo(){
/* بيانات تجريبية أولية */
(function(){if(K.get("seeded"))return;
K.set("trips",[{id:"t1",lineId:"l1",when:"أمس — 07:00",status:"done",rated:false}]);
K.set("bookings",[]);K.set("reports",[]);K.set("requests",[]);K.set("pxRatings",{});
K.set("broadcasts",[{t:"تنبيه: غدًا عطلة رسمية — لا توجد رحلات.",d:"قبل يومين"}]);
K.set("chat_l1",[{me:0,t:"صباح الخير، أنا عند نقطة ساحة الكاظمية",time:"06:52"},{me:1,t:"صباح النور، قادم خلال ٥ دقائق",time:"06:53"}]);
K.set("myComments",{});K.set("seeded",1);
})();

}
